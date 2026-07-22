use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use ed25519_dalek::pkcs8::DecodePublicKey;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

pub const MAX_MANIFEST_BYTES: usize = 128 * 1024;
pub const MAX_RUNTIME_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_RUNTIME_FILES: usize = 4096;
const MAX_LIFETIME_SECONDS: i64 = 31 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS: i64 = 5 * 60;

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("manifest JSON is not valid: {0}")]
    Json(#[from] serde_json::Error),
    #[error("manifest signature encoding is not valid")]
    SignatureEncoding,
    #[error("manifest signature is not valid")]
    Signature,
    #[error("public key is not valid")]
    PublicKey,
    #[error("manifest field is not valid: {0}")]
    Invalid(&'static str),
    #[error("Runtime path is not safe: {0}")]
    UnsafePath(String),
    #[error("Runtime package is too large")]
    TooLarge,
    #[error("I/O failed: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Clone, Debug)]
pub struct VerificationContext {
    pub public_key_path: PathBuf,
    pub expected_key_id: String,
    pub app_version: String,
    pub channel: String,
    pub bootstrap_api_version: u32,
    pub runtime_api_version: u32,
    pub now_epoch_seconds: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeFile {
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RuntimeManifest {
    pub schema_version: u32,
    pub runtime_revision: u64,
    pub sequence: u64,
    pub channel: String,
    pub baseline_range: String,
    pub bootstrap_api_version: u32,
    pub runtime_api_version: u32,
    pub issued_at: String,
    pub expires_at: String,
    pub files: BTreeMap<String, RuntimeFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SignedEnvelope {
    key_id: String,
    signed: Value,
    signature: String,
}

pub fn canonical_json(value: &Value) -> Result<String, ManifestError> {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            Ok(serde_json::to_string(value)?)
        }
        Value::Array(values) => {
            let items = values
                .iter()
                .map(canonical_json)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", items.join(",")))
        }
        Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort();
            let entries = keys
                .into_iter()
                .map(|key| {
                    Ok(format!(
                        "{}:{}",
                        serde_json::to_string(key)?,
                        canonical_json(&values[key])?
                    ))
                })
                .collect::<Result<Vec<_>, ManifestError>>()?;
            Ok(format!("{{{}}}", entries.join(",")))
        }
    }
}

pub fn verify_manifest(
    bytes: &[u8],
    context: &VerificationContext,
) -> Result<RuntimeManifest, ManifestError> {
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err(ManifestError::TooLarge);
    }
    let envelope: SignedEnvelope = serde_json::from_slice(bytes)?;
    if envelope.key_id != context.expected_key_id {
        return Err(ManifestError::Invalid("keyId"));
    }
    let public_key_pem = fs::read_to_string(&context.public_key_path)?;
    let public_key =
        VerifyingKey::from_public_key_pem(&public_key_pem).map_err(|_| ManifestError::PublicKey)?;
    let signature_bytes = STANDARD
        .decode(envelope.signature)
        .map_err(|_| ManifestError::SignatureEncoding)?;
    let signature =
        Signature::from_slice(&signature_bytes).map_err(|_| ManifestError::SignatureEncoding)?;
    let canonical = canonical_json(&envelope.signed)?;
    public_key
        .verify(canonical.as_bytes(), &signature)
        .map_err(|_| ManifestError::Signature)?;
    let manifest: RuntimeManifest = serde_json::from_value(envelope.signed)?;
    validate_manifest(&manifest, context)?;
    Ok(manifest)
}

fn validate_manifest(
    manifest: &RuntimeManifest,
    context: &VerificationContext,
) -> Result<(), ManifestError> {
    if manifest.schema_version != 1 {
        return Err(ManifestError::Invalid("schemaVersion"));
    }
    if manifest.runtime_revision == 0 {
        return Err(ManifestError::Invalid("runtimeRevision"));
    }
    if manifest.sequence == 0 {
        return Err(ManifestError::Invalid("sequence"));
    }
    if manifest.channel != context.channel {
        return Err(ManifestError::Invalid("channel"));
    }
    if manifest.bootstrap_api_version != context.bootstrap_api_version {
        return Err(ManifestError::Invalid("bootstrapApiVersion"));
    }
    if manifest.runtime_api_version != context.runtime_api_version {
        return Err(ManifestError::Invalid("runtimeApiVersion"));
    }
    if !matches!(manifest.channel.as_str(), "stable" | "developer") {
        return Err(ManifestError::Invalid("channel"));
    }
    let issued_at = OffsetDateTime::parse(&manifest.issued_at, &Rfc3339)
        .map_err(|_| ManifestError::Invalid("issuedAt"))?
        .unix_timestamp();
    let expires_at = OffsetDateTime::parse(&manifest.expires_at, &Rfc3339)
        .map_err(|_| ManifestError::Invalid("expiresAt"))?
        .unix_timestamp();
    if expires_at <= issued_at
        || expires_at - issued_at > MAX_LIFETIME_SECONDS
        || issued_at > context.now_epoch_seconds + CLOCK_SKEW_SECONDS
        || expires_at <= context.now_epoch_seconds
    {
        return Err(ManifestError::Invalid("Runtime lifetime"));
    }
    let version =
        Version::parse(&context.app_version).map_err(|_| ManifestError::Invalid("appVersion"))?;
    let normalized_range = manifest
        .baseline_range
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(", ");
    let range = VersionReq::parse(&normalized_range)
        .map_err(|_| ManifestError::Invalid("baselineRange"))?;
    if !range.matches(&version) {
        return Err(ManifestError::Invalid("baselineRange"));
    }
    if manifest.files.is_empty() || manifest.files.len() > MAX_RUNTIME_FILES {
        return Err(ManifestError::Invalid("files"));
    }
    let mut total = 0_u64;
    for (path, file) in &manifest.files {
        validate_runtime_path(path)?;
        if file.size == 0
            || file.sha256.len() != 64
            || !file.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err(ManifestError::Invalid("files"));
        }
        total = total
            .checked_add(file.size)
            .ok_or(ManifestError::TooLarge)?;
        if total > MAX_RUNTIME_BYTES {
            return Err(ManifestError::TooLarge);
        }
    }
    Ok(())
}

pub fn validate_runtime_path(value: &str) -> Result<(), ManifestError> {
    if value.is_empty() || value.contains('\\') || value == "manifest.json" {
        return Err(ManifestError::UnsafePath(value.to_owned()));
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(ManifestError::UnsafePath(value.to_owned()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_json_sorts_object_keys() {
        let value: Value = serde_json::from_str(r#"{"z":1,"a":{"d":4,"b":2}}"#).unwrap();
        assert_eq!(
            canonical_json(&value).unwrap(),
            r#"{"a":{"b":2,"d":4},"z":1}"#
        );
    }

    #[test]
    fn runtime_paths_reject_traversal_and_manifest_replacement() {
        assert!(validate_runtime_path("renderer/index.html").is_ok());
        assert!(validate_runtime_path("../escape").is_err());
        assert!(validate_runtime_path("/absolute").is_err());
        assert!(validate_runtime_path("renderer\\index.html").is_err());
        assert!(validate_runtime_path("manifest.json").is_err());
    }
}
