use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::archive::{ArchiveError, extract_verified_package, inactive_slot_path};
use crate::manifest::VerificationContext;

#[derive(Debug, Error)]
pub enum StateError {
    #[error(transparent)]
    Archive(#[from] ArchiveError),
    #[error("Runtime state is not valid: {0}")]
    Invalid(&'static str),
    #[error("I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("state JSON is not valid: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeState {
    pub schema_version: u32,
    pub active_slot: Option<String>,
    pub previous_slot: Option<String>,
    pub pending_slot: Option<String>,
    pub runtime_revision: u64,
    pub pending_revision: Option<u64>,
    pub highest_runtime_revision: u64,
    pub highest_sequence: u64,
    pub awaiting_health: bool,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            active_slot: None,
            previous_slot: None,
            pending_slot: None,
            runtime_revision: 0,
            pending_revision: None,
            highest_runtime_revision: 0,
            highest_sequence: 0,
            awaiting_health: false,
        }
    }
}

#[derive(Debug)]
pub struct StagedRuntime {
    pub revision: u64,
    pub slot: String,
}

pub struct RuntimeStore {
    root: PathBuf,
    state: RuntimeState,
}

impl RuntimeStore {
    pub fn open(root: PathBuf) -> Result<Self, StateError> {
        fs::create_dir_all(root.join("slots"))?;
        let state_path = root.join("state.json");
        let state = if state_path.exists() {
            serde_json::from_slice(&fs::read(state_path)?)?
        } else {
            RuntimeState::default()
        };
        validate_state(&state)?;
        Ok(Self { root, state })
    }

    pub fn state(&self) -> &RuntimeState {
        &self.state
    }

    pub fn stage(
        &mut self,
        package: &Path,
        context: &VerificationContext,
    ) -> Result<StagedRuntime, StateError> {
        if self.state.pending_slot.is_some() || self.state.awaiting_health {
            return Err(StateError::Invalid("another Runtime transition is active"));
        }
        let target = match self.state.active_slot.as_deref() {
            Some("a") => "b",
            _ => "a",
        };
        let destination = inactive_slot_path(&self.root, target);
        let temporary = self.root.join("slots").join(format!("{target}.pending"));
        if temporary.exists() {
            fs::remove_dir_all(&temporary)?;
        }
        let verified = extract_verified_package(package, &temporary, context)?;
        if verified.manifest.sequence <= self.state.highest_sequence {
            fs::remove_dir_all(&temporary)?;
            return Err(StateError::Invalid("Runtime sequence was already used"));
        }
        if verified.manifest.runtime_revision <= self.state.highest_runtime_revision {
            fs::remove_dir_all(&temporary)?;
            return Err(StateError::Invalid("Runtime revision was already used"));
        }
        if destination.exists() {
            fs::remove_dir_all(&destination)?;
        }
        fs::rename(&temporary, &destination)?;
        self.state.pending_slot = Some(target.to_owned());
        self.state.pending_revision = Some(verified.manifest.runtime_revision);
        self.state.highest_runtime_revision = verified.manifest.runtime_revision;
        self.state.highest_sequence = verified.manifest.sequence;
        self.write_state()?;
        Ok(StagedRuntime {
            revision: verified.manifest.runtime_revision,
            slot: target.to_owned(),
        })
    }

    pub fn activate(&mut self) -> Result<String, StateError> {
        if self.state.awaiting_health {
            return Err(StateError::Invalid(
                "health confirmation is already pending",
            ));
        }
        let pending = self
            .state
            .pending_slot
            .take()
            .ok_or(StateError::Invalid("no Runtime is staged"))?;
        let revision = self
            .state
            .pending_revision
            .take()
            .ok_or(StateError::Invalid("staged Runtime revision is missing"))?;
        self.state.previous_slot = self.state.active_slot.replace(pending.clone());
        self.state.runtime_revision = revision;
        self.state.awaiting_health = true;
        self.write_state()?;
        Ok(pending)
    }

    pub fn confirm(&mut self) -> Result<(), StateError> {
        if !self.state.awaiting_health {
            return Err(StateError::Invalid(
                "no Runtime health confirmation is pending",
            ));
        }
        self.state.awaiting_health = false;
        self.write_state()
    }

    pub fn rollback(&mut self) -> Result<Option<String>, StateError> {
        if !self.state.awaiting_health
            && let Some(pending) = self.state.pending_slot.take()
        {
            self.state.pending_revision = None;
            let path = inactive_slot_path(&self.root, &pending);
            if path.exists() {
                fs::remove_dir_all(path)?;
            }
            self.write_state()?;
            return Ok(self.state.active_slot.clone());
        }
        if !self.state.awaiting_health {
            return Err(StateError::Invalid(
                "rollback requires a staged or unconfirmed Runtime",
            ));
        }
        self.state.active_slot = self.state.previous_slot.take();
        self.state.runtime_revision = self
            .state
            .active_slot
            .as_deref()
            .and_then(|slot| runtime_revision(&inactive_slot_path(&self.root, slot)).ok())
            .unwrap_or(0);
        self.state.awaiting_health = false;
        self.write_state()?;
        Ok(self.state.active_slot.clone())
    }

    fn write_state(&self) -> Result<(), StateError> {
        let path = self.root.join("state.json");
        let temporary = self.root.join("state.json.pending");
        fs::write(&temporary, serde_json::to_vec_pretty(&self.state)?)?;
        fs::rename(temporary, path)?;
        Ok(())
    }
}

fn validate_state(state: &RuntimeState) -> Result<(), StateError> {
    if state.schema_version != 1 {
        return Err(StateError::Invalid("schemaVersion"));
    }
    for slot in [
        state.active_slot.as_deref(),
        state.previous_slot.as_deref(),
        state.pending_slot.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if !matches!(slot, "a" | "b") {
            return Err(StateError::Invalid("slot"));
        }
    }
    if state.pending_slot.is_some() != state.pending_revision.is_some() {
        return Err(StateError::Invalid("pending Runtime"));
    }
    if state.runtime_revision > state.highest_runtime_revision
        || state
            .pending_revision
            .is_some_and(|revision| revision > state.highest_runtime_revision)
    {
        return Err(StateError::Invalid("Runtime revision history"));
    }
    if state.active_slot == state.pending_slot && state.active_slot.is_some() {
        return Err(StateError::Invalid("active and pending slots"));
    }
    if state.awaiting_health && state.pending_slot.is_some() {
        return Err(StateError::Invalid("health transition"));
    }
    Ok(())
}

fn runtime_revision(slot: &Path) -> Result<u64, StateError> {
    let bytes = fs::read(slot.join("manifest.json"))?;
    let value: serde_json::Value = serde_json::from_slice(&bytes)?;
    value["signed"]["runtimeRevision"]
        .as_u64()
        .ok_or(StateError::Invalid("runtimeRevision"))
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::fs::File;
    use std::io::Write;

    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use ed25519_dalek::pkcs8::EncodePublicKey;
    use ed25519_dalek::pkcs8::spki::der::pem::LineEnding;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use tempfile::TempDir;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use super::*;
    use crate::manifest::{RuntimeFile, RuntimeManifest, canonical_json};

    struct Fixture {
        temporary: TempDir,
        signing_key: SigningKey,
        public_key: PathBuf,
        context: VerificationContext,
    }

    impl Fixture {
        fn new() -> Self {
            let temporary = TempDir::new().unwrap();
            let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
            let public_key = temporary.path().join("public.pem");
            fs::write(
                &public_key,
                signing_key
                    .verifying_key()
                    .to_public_key_pem(LineEnding::LF)
                    .unwrap(),
            )
            .unwrap();
            let context = VerificationContext {
                public_key_path: public_key.clone(),
                expected_key_id: "panel-runtime-test".to_owned(),
                app_version: "1.1.0-alpha.1".to_owned(),
                channel: "developer".to_owned(),
                bootstrap_api_version: 1,
                runtime_api_version: 1,
                now_epoch_seconds: 1_800_000_000,
            };
            Self {
                temporary,
                signing_key,
                public_key,
                context,
            }
        }

        fn package(&self, revision: u64, sequence: u64, content: &[u8]) -> PathBuf {
            let mut files = BTreeMap::new();
            files.insert(
                "renderer/index.html".to_owned(),
                RuntimeFile {
                    sha256: hex::encode(Sha256::digest(content)),
                    size: content.len() as u64,
                },
            );
            let manifest = RuntimeManifest {
                schema_version: 1,
                runtime_revision: revision,
                sequence,
                channel: "developer".to_owned(),
                baseline_range: ">=1.1.0-alpha.1 <1.2.0".to_owned(),
                bootstrap_api_version: 1,
                runtime_api_version: 1,
                issued_at: "2027-01-15T08:00:00Z".to_owned(),
                expires_at: "2027-01-22T08:00:00Z".to_owned(),
                files,
            };
            let signed = serde_json::to_value(manifest).unwrap();
            let signature = self
                .signing_key
                .sign(canonical_json(&signed).unwrap().as_bytes());
            let envelope = json!({
                "keyId": "panel-runtime-test",
                "signed": signed,
                "signature": STANDARD.encode(signature.to_bytes()),
            });
            let path = self
                .temporary
                .path()
                .join(format!("runtime-{revision}-{sequence}.zip"));
            let file = File::create(&path).unwrap();
            let mut archive = ZipWriter::new(file);
            let options = SimpleFileOptions::default();
            archive.start_file("manifest.json", options).unwrap();
            archive
                .write_all(&serde_json::to_vec_pretty(&envelope).unwrap())
                .unwrap();
            archive.start_file("renderer/index.html", options).unwrap();
            archive.write_all(content).unwrap();
            archive.finish().unwrap();
            path
        }

        fn root(&self) -> PathBuf {
            self.temporary.path().join("runtime-store")
        }
    }

    #[test]
    fn stages_activates_confirms_and_rolls_back_between_slots() {
        let fixture = Fixture::new();
        assert!(fixture.public_key.exists());
        let mut store = RuntimeStore::open(fixture.root()).unwrap();

        let first = fixture.package(1, 1, b"Runtime one");
        let staged = store.stage(&first, &fixture.context).unwrap();
        assert_eq!(staged.slot, "a");
        assert_eq!(store.activate().unwrap(), "a");
        store.confirm().unwrap();
        assert_eq!(store.state.runtime_revision, 1);

        let second = fixture.package(2, 2, b"Runtime two");
        let staged = store.stage(&second, &fixture.context).unwrap();
        assert_eq!(staged.slot, "b");
        assert_eq!(store.activate().unwrap(), "b");
        assert_eq!(store.rollback().unwrap(), Some("a".to_owned()));
        assert_eq!(store.state.runtime_revision, 1);
        assert_eq!(store.state.highest_runtime_revision, 2);
        assert_eq!(store.state.highest_sequence, 2);
        assert!(!store.state.awaiting_health);

        let reused_revision = fixture.package(2, 3, b"Changed Runtime two");
        let error = store.stage(&reused_revision, &fixture.context).unwrap_err();
        assert!(error.to_string().contains("revision was already used"));
    }

    #[test]
    fn rejects_replay_and_can_discard_a_staged_runtime() {
        let fixture = Fixture::new();
        let mut store = RuntimeStore::open(fixture.root()).unwrap();
        let first = fixture.package(1, 4, b"Runtime one");
        store.stage(&first, &fixture.context).unwrap();
        assert_eq!(store.rollback().unwrap(), None);
        assert_eq!(store.state.highest_sequence, 4);
        assert!(store.state.pending_slot.is_none());

        let replay = fixture.package(2, 4, b"Runtime replay");
        let error = store.stage(&replay, &fixture.context).unwrap_err();
        assert!(error.to_string().contains("sequence was already used"));
    }

    #[test]
    fn rejects_an_incompatible_runtime_api() {
        let fixture = Fixture::new();
        let package = fixture.package(1, 1, b"Runtime one");
        let mut context = fixture.context.clone();
        context.runtime_api_version = 2;
        let mut store = RuntimeStore::open(fixture.root()).unwrap();

        let error = store.stage(&package, &context).unwrap_err();
        assert!(error.to_string().contains("runtimeApiVersion"));
    }

    #[test]
    fn rejects_an_undeclared_runtime_file_entry() {
        let fixture = Fixture::new();
        let package = fixture.package(1, 1, b"Expected content");
        let file = File::options()
            .read(true)
            .write(true)
            .open(&package)
            .unwrap();
        let mut archive = ZipWriter::new_append(file).unwrap();
        archive
            .start_file("renderer/injected.js", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"Tampered content").unwrap();
        archive.finish().unwrap();

        let mut store = RuntimeStore::open(fixture.root()).unwrap();
        assert!(store.stage(&package, &fixture.context).is_err());
    }
}
