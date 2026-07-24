use std::collections::BTreeSet;
use std::fs::{self, File};
use std::io::{Read, Seek};
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;
use zip::ZipArchive;

use crate::manifest::{
    MAX_MANIFEST_BYTES, MAX_RUNTIME_BYTES, MAX_RUNTIME_FILES, ManifestError, RuntimeManifest,
    VerificationContext, verify_manifest,
};

const MAX_ARCHIVE_BYTES: u64 = MAX_RUNTIME_BYTES + 16 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = MAX_RUNTIME_FILES * 2 + 1;

#[derive(Debug, Error)]
pub enum ArchiveError {
    #[error(transparent)]
    Manifest(#[from] ManifestError),
    #[error("Runtime archive is not valid: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Runtime archive content does not match the manifest")]
    Content,
    #[error("Runtime archive contains an unsafe entry: {0}")]
    UnsafeEntry(String),
    #[error("I/O failed: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedPackage {
    pub manifest: RuntimeManifest,
}

pub fn verify_package(
    package: &Path,
    context: &VerificationContext,
) -> Result<VerifiedPackage, ArchiveError> {
    validate_archive_size(package)?;
    let file = File::open(package)?;
    let mut archive = ZipArchive::new(file)?;
    let manifest_bytes = read_manifest(&mut archive)?;
    let manifest = verify_manifest(&manifest_bytes, context)?;
    verify_entries(&mut archive, &manifest)?;
    Ok(VerifiedPackage { manifest })
}

pub fn extract_verified_package(
    package: &Path,
    destination: &Path,
    context: &VerificationContext,
) -> Result<VerifiedPackage, ArchiveError> {
    validate_archive_size(package)?;
    let file = File::open(package)?;
    let mut archive = ZipArchive::new(file)?;
    let manifest_bytes = read_manifest(&mut archive)?;
    let manifest = verify_manifest(&manifest_bytes, context)?;
    verify_entries(&mut archive, &manifest)?;
    fs::create_dir_all(destination)?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        if entry.is_dir() || entry.name() == "manifest.json" {
            continue;
        }
        let output = destination.join(entry.name());
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut file = File::create(output)?;
        std::io::copy(&mut entry, &mut file)?;
    }
    fs::write(destination.join("manifest.json"), manifest_bytes)?;
    Ok(VerifiedPackage { manifest })
}

fn read_manifest<R: Read + Seek>(archive: &mut ZipArchive<R>) -> Result<Vec<u8>, ArchiveError> {
    let mut entry = archive.by_name("manifest.json")?;
    if entry.size() as usize > MAX_MANIFEST_BYTES {
        return Err(ArchiveError::Manifest(ManifestError::TooLarge));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn verify_entries<R: Read + Seek>(
    archive: &mut ZipArchive<R>,
    manifest: &RuntimeManifest,
) -> Result<(), ArchiveError> {
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(ArchiveError::Manifest(ManifestError::TooLarge));
    }
    let expected = manifest.files.keys().cloned().collect::<BTreeSet<_>>();
    let mut found = BTreeSet::new();
    let mut manifest_entries = 0_u8;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let name = entry.name().to_owned();
        if entry.enclosed_name().is_none() {
            return Err(ArchiveError::UnsafeEntry(name));
        }
        if let Some(mode) = entry.unix_mode() {
            let kind = mode & 0o170000;
            if kind == 0o120000 || (!entry.is_dir() && kind != 0 && kind != 0o100000) {
                return Err(ArchiveError::UnsafeEntry(name));
            }
        }
        if name == "manifest.json" {
            manifest_entries = manifest_entries.saturating_add(1);
            continue;
        }
        if entry.is_dir() {
            continue;
        }
        let declared = manifest.files.get(&name).ok_or(ArchiveError::Content)?;
        if !found.insert(name) || entry.size() != declared.size {
            return Err(ArchiveError::Content);
        }
        let mut hasher = Sha256::new();
        let copied = std::io::copy(&mut entry, &mut hasher)?;
        if copied != declared.size
            || hex::encode(hasher.finalize()) != declared.sha256.to_lowercase()
        {
            return Err(ArchiveError::Content);
        }
    }
    if manifest_entries != 1 || found != expected {
        return Err(ArchiveError::Content);
    }
    Ok(())
}

fn validate_archive_size(package: &Path) -> Result<(), ArchiveError> {
    if fs::metadata(package)?.len() > MAX_ARCHIVE_BYTES {
        return Err(ArchiveError::Manifest(ManifestError::TooLarge));
    }
    Ok(())
}

pub fn inactive_slot_path(root: &Path, slot: &str) -> PathBuf {
    root.join("slots").join(slot)
}
