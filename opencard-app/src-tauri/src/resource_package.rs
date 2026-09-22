use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::{Mutex, OnceLock};
use unicode_normalization::UnicodeNormalization;
use zip::ZipArchive;

const MAX_ARCHIVE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 256 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;
pub(crate) const MAX_PATH_BYTES: usize = 512;
const MAX_PATH_DEPTH: usize = 32;
const MAX_COMPRESSION_RATIO: u64 = 200;
const MANIFEST_PATH: &str = ".opencard/manifest.json";
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
static PACKAGE_MUTATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectResourcePackageRequest {
    pub project_root_path: String,
    pub source_path: String,
    #[serde(default)]
    pub target_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourcePackageInspection {
    pub manifest_json: String,
    pub content_hash: String,
    pub existing_manifest_json: Option<String>,
    pub existing_fingerprint: Option<String>,
    pub entry_count: usize,
    pub unpacked_bytes: u64,
    pub entry_paths: Vec<String>,
    pub fonts_json: Option<String>,
    pub icons_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResourcePackageRequest {
    pub project_root_path: String,
    pub source_path: String,
    pub target_key: String,
    pub expected_content_hash: String,
    pub expected_existing_fingerprint: Option<String>,
    pub manifest_json: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectInstalledResourcePackageRequest {
    pub project_root_path: String,
    pub package_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeInstalledResourcePackageInspection {
    pub exists: bool,
    pub manifest_json: Option<String>,
    pub content_hash: Option<String>,
    pub entry_paths: Vec<String>,
    pub fonts_json: Option<String>,
    pub icons_json: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourcePackageInstallResult {
    pub target_path: String,
    pub replaced: bool,
    pub fingerprint: String,
}

#[derive(Debug, Clone)]
struct ArchiveEntry {
    index: usize,
    path: String,
    size: u64,
}

struct ArchiveProjection {
    archive: ZipArchive<File>,
    entries: Vec<ArchiveEntry>,
    manifest_index: usize,
    unpacked_bytes: u64,
}

fn portable_segment(segment: &str) -> bool {
    if segment.is_empty()
        || segment == "."
        || segment == ".."
        || segment.ends_with(['.', ' '])
        || segment.chars().any(|character| {
            character.is_control() || matches!(character, '<' | '>' | ':' | '"' | '\\' | '|' | '?' | '*')
        })
    {
        return false;
    }
    let stem = segment.split('.').next().unwrap_or(segment).to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3"
        | "COM4" | "COM5" | "COM6" | "COM7" | "COM8" | "COM9" | "LPT1" | "LPT2"
        | "LPT3" | "LPT4" | "LPT5" | "LPT6" | "LPT7" | "LPT8" | "LPT9")
}

pub(crate) fn normalize_archive_path(raw: &[u8]) -> Result<String, String> {
    let path = std::str::from_utf8(raw)
        .map_err(|_| "Package paths must use UTF-8".to_string())?;
    if path.is_empty() || path.starts_with('/') || path.contains('\\') || path.len() > MAX_PATH_BYTES {
        return Err(format!("Unsafe package archive path: {path}"));
    }
    let normalized = path.nfc().collect::<String>();
    if normalized != path {
        return Err(format!("Package path is not Unicode NFC: {path}"));
    }
    let segments = path.split('/').collect::<Vec<_>>();
    if segments.len() > MAX_PATH_DEPTH || segments.iter().any(|segment| !portable_segment(segment)) {
        return Err(format!("Unsafe package archive path: {path}"));
    }
    Ok(path.to_string())
}

fn open_archive(source_path: &Path) -> Result<ArchiveProjection, String> {
    let metadata = std::fs::symlink_metadata(source_path)
        .map_err(|error| format!("Cannot access package: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Package source must be a regular file".to_string());
    }
    if metadata.len() > MAX_ARCHIVE_BYTES {
        return Err("Package archive is too large".to_string());
    }
    let file = File::open(source_path).map_err(|error| format!("Cannot read package: {error}"))?;
    let mut archive = ZipArchive::new(file).map_err(|_| "Package archive is corrupt".to_string())?;
    if archive.len() == 0 || archive.len() > MAX_ENTRIES {
        return Err("Package archive has an invalid entry count".to_string());
    }

    let mut identities = HashSet::new();
    let mut entries = Vec::with_capacity(archive.len());
    let mut manifest_index = None;
    let mut unpacked_bytes = 0_u64;
    for index in 0..archive.len() {
        let file = archive.by_index(index).map_err(|error| format!("Cannot inspect ZIP entry: {error}"))?;
        if file.is_dir() {
            return Err("Package archives must not contain explicit directory entries".to_string());
        }
        if file.unix_mode().is_some_and(|mode| mode & 0o170000 == 0o120000) {
            return Err("Package archives must not contain symbolic links".to_string());
        }
        let path = normalize_archive_path(file.name_raw())?;
        let identity = path.to_lowercase();
        if !identities.insert(identity.clone()) {
            return Err(format!("Duplicate package archive path: {path}"));
        }
        let size = file.size();
        if size > MAX_FILE_BYTES {
            return Err(format!("Package file is too large: {path}"));
        }
        if size > 1024 * 1024
            && (file.compressed_size() == 0
                || size / file.compressed_size().max(1) > MAX_COMPRESSION_RATIO)
        {
            return Err(format!("Package compression ratio is unsafe: {path}"));
        }
        unpacked_bytes = unpacked_bytes
            .checked_add(size)
            .ok_or_else(|| "Package unpacked size overflowed".to_string())?;
        if unpacked_bytes > MAX_UNPACKED_BYTES {
            return Err("Unpacked package is too large".to_string());
        }
        if identity == MANIFEST_PATH {
            if size > MAX_MANIFEST_BYTES {
                return Err("Package manifest is too large".to_string());
            }
            manifest_index = Some(index);
        } else {
            entries.push(ArchiveEntry { index, path, size });
        }
    }
    let manifest_index = manifest_index.ok_or_else(|| "Package manifest is missing".to_string())?;
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(ArchiveProjection { archive, entries, manifest_index, unpacked_bytes })
}

fn read_zip_entry(archive: &mut ZipArchive<File>, index: usize, limit: u64) -> Result<Vec<u8>, String> {
    let mut file = archive.by_index(index).map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
    if file.size() > limit {
        return Err("Package entry exceeds its read limit".to_string());
    }
    let mut bytes = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut bytes).map_err(|error| format!("Cannot read ZIP entry: {error}"))?;
    if bytes.len() as u64 != file.size() {
        return Err("Package entry size changed while reading".to_string());
    }
    Ok(bytes)
}

fn hash_projection(projection: &mut ArchiveProjection) -> Result<String, String> {
    let mut digest = Sha256::new();
    digest.update(b"opencard-resource-package-content\0v1\n");
    let entries = projection.entries.clone();
    let mut buffer = [0_u8; 64 * 1024];
    for entry in entries {
        let path = entry.path.as_bytes();
        digest.update((path.len() as u64).to_be_bytes());
        digest.update(path);
        digest.update(entry.size.to_be_bytes());
        let mut file = projection.archive.by_index(entry.index)
            .map_err(|error| format!("Cannot hash ZIP entry: {error}"))?;
        let mut read_bytes = 0_u64;
        loop {
            let count = file.read(&mut buffer).map_err(|error| format!("Cannot hash ZIP entry: {error}"))?;
            if count == 0 { break; }
            read_bytes += count as u64;
            if read_bytes > entry.size {
                return Err(format!("Package entry exceeded its declared size: {}", entry.path));
            }
            digest.update(&buffer[..count]);
        }
        if read_bytes != entry.size {
            return Err(format!("Package entry size mismatch: {}", entry.path));
        }
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn sha256_text(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn canonical_project_root(path: &str) -> Result<PathBuf, String> {
    let root = std::fs::canonicalize(path).map_err(|error| format!("Cannot access project root: {error}"))?;
    if !root.is_dir() {
        return Err("Project root must be a directory".to_string());
    }
    Ok(root)
}

fn manifest_identity(manifest_json: &str) -> Result<(String, String), String> {
    let value: serde_json::Value = serde_json::from_str(manifest_json)
        .map_err(|_| "Package manifest is invalid JSON".to_string())?;
    let key = value.get("key").and_then(|v| v.as_str()).unwrap_or("").trim().to_ascii_lowercase();
    let version = value.get("version").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if version.is_empty() || !key.bytes().next().is_some_and(|byte| byte.is_ascii_alphanumeric())
        || !key.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')) {
        return Err("Package manifest identity is incomplete".to_string());
    }
    Ok((key, version))
}

fn package_target(root: &Path, key: &str) -> PathBuf { root.join(".opencard").join("packages").join(key) }

fn normalize_package_key(value: &str) -> Result<String, String> {
    let key = value.trim().to_ascii_lowercase();
    if key.is_empty() || !key.bytes().next().is_some_and(|byte| byte.is_ascii_alphanumeric())
        || !key.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')) {
        return Err("Package Key is invalid".to_string());
    }
    Ok(key)
}

fn transaction_base<'a>(name: &'a str, marker: &str) -> Option<&'a str> {
    let (base, suffix) = name.rsplit_once(marker)?;
    (!base.is_empty() && !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit())).then_some(base)
}

fn validate_existing_target(root: &Path, target: &Path) -> Result<(), String> {
    if !target.exists() { return Ok(()); }
    let metadata = std::fs::symlink_metadata(target).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() { return Err("Installed package target must be a regular directory".to_string()); }
    let canonical = std::fs::canonicalize(target).map_err(|e| e.to_string())?;
    if !canonical.starts_with(root) { return Err("Installed package target escapes the project root".to_string()); }
    Ok(())
}

#[tauri::command]
pub async fn inspect_installed_resource_package(request: InspectInstalledResourcePackageRequest) -> Result<NativeInstalledResourcePackageInspection, String> {
    let root = canonical_project_root(&request.project_root_path)?;
    let key = normalize_package_key(&request.package_key)?;
    let target = package_target(&root, &key);
    if !target.exists() {
        return Ok(NativeInstalledResourcePackageInspection { exists: false, manifest_json: None, content_hash: None, entry_paths: Vec::new(), fonts_json: None, icons_json: None });
    }
    validate_existing_target(&root, &target)?;
    let manifest_path = target.join(MANIFEST_PATH);
    let manifest_json = std::fs::read_to_string(&manifest_path).map_err(|e| format!("Cannot read installed manifest: {e}"))?;
    let (_, _) = manifest_identity(&manifest_json)?;
    let mut files = Vec::new();
    collect_installed_files(&target, &target, &mut files)?;
    let entry_paths = files.iter().map(|(relative, _, _)| relative.clone()).collect::<Vec<_>>();
    let fonts_json = files.iter().find(|(relative, _, _)| relative.eq_ignore_ascii_case(".opencard/fonts/fonts.json"))
        .map(|(_, path, _)| std::fs::read_to_string(path).map_err(|e| format!("Cannot read installed font registry: {e}"))).transpose()?;
    let icons_json = files.iter().find(|(relative, _, _)| relative.eq_ignore_ascii_case(".opencard/icons/icons.json"))
        .map(|(_, path, _)| std::fs::read_to_string(path).map_err(|e| format!("Cannot read installed icon registry: {e}"))).transpose()?;
    let (_, content_hash) = fingerprint(&target)?;
    Ok(NativeInstalledResourcePackageInspection { exists: true, manifest_json: Some(manifest_json), content_hash: Some(content_hash), entry_paths, fonts_json, icons_json })
}

fn fingerprint(path: &Path) -> Result<(String, String), String> {
    let manifest = path.join(MANIFEST_PATH);
    let text = std::fs::read_to_string(&manifest).map_err(|e| format!("Cannot read installed manifest: {e}"))?;
    let mut files = Vec::new();
    collect_installed_files(path, path, &mut files)?;
    files.sort_by(|left, right| left.0.cmp(&right.0));
    let mut content = Sha256::new();
    content.update(b"opencard-resource-package-content\0v1\n");
    for (relative, file_path, size) in files {
        if relative.eq_ignore_ascii_case(MANIFEST_PATH) { continue; }
        content.update((relative.len() as u64).to_be_bytes()); content.update(relative.as_bytes()); content.update(size.to_be_bytes());
        let mut file = File::open(file_path).map_err(|e| e.to_string())?; let mut buffer = [0_u8; 64 * 1024];
        loop { let count = file.read(&mut buffer).map_err(|e| e.to_string())?; if count == 0 { break; } content.update(&buffer[..count]); }
    }
    let content_hash = format!("{:x}", content.finalize());
    Ok((sha256_text(&format!("{text}\0{content_hash}")), content_hash))
}

fn collect_installed_files(base: &Path, current: &Path, result: &mut Vec<(String, PathBuf, u64)>) -> Result<(), String> {
    for entry in std::fs::read_dir(current).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?; let path = entry.path(); let metadata = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if metadata.file_type().is_symlink() { return Err("Installed package contains a symbolic link".to_string()); }
        if metadata.is_dir() { collect_installed_files(base, &path, result)?; continue; }
        if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES || result.len() >= MAX_ENTRIES { return Err("Installed package projection is unsafe".to_string()); }
        let relative = path.strip_prefix(base).map_err(|_| "Installed package path escaped its root".to_string())?.to_string_lossy().replace('\\', "/");
        normalize_archive_path(relative.as_bytes())?; result.push((relative, path, metadata.len()));
    }
    Ok(())
}

#[tauri::command]
pub async fn recover_resource_package_transactions(project_root_path: String) -> Result<(), String> {
    let _guard = PACKAGE_MUTATION_LOCK.get_or_init(|| Mutex::new(())).lock().map_err(|_| "Package mutation lock is poisoned".to_string())?;
    let root = canonical_project_root(&project_root_path)?;
    let packages = root.join(".opencard").join("packages");
    if !packages.is_dir() { return Ok(()); }
    for entry in std::fs::read_dir(&packages).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if transaction_base(&name, ".install-").is_some() { let _ = std::fs::remove_dir_all(path); }
        else if let Some(target_name) = transaction_base(&name, ".backup-") {
            let target = packages.join(target_name);
            if !target.exists() { std::fs::rename(&path, target).map_err(|e| e.to_string())?; }
            else { let _ = std::fs::remove_dir_all(path); }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn inspect_resource_package(request: InspectResourcePackageRequest) -> Result<NativeResourcePackageInspection, String> {
    let root = canonical_project_root(&request.project_root_path)?;
    let source = std::fs::canonicalize(&request.source_path).map_err(|e| format!("Cannot access package: {e}"))?;
    let mut projection = open_archive(&source)?;
    let manifest_bytes = read_zip_entry(&mut projection.archive, projection.manifest_index, MAX_MANIFEST_BYTES)?;
    let manifest_json = String::from_utf8(manifest_bytes).map_err(|_| "Package manifest must be UTF-8".to_string())?;
    let (package_key, _) = manifest_identity(&manifest_json)?;
    let target_key = match request.target_key.as_deref() {
        Some(value) => normalize_package_key(value)?,
        None => package_key.clone(),
    };
    let fonts_json = projection.entries.iter().find(|entry| entry.path.eq_ignore_ascii_case(".opencard/fonts/fonts.json")).map(|entry| read_zip_entry(&mut projection.archive, entry.index, MAX_MANIFEST_BYTES).and_then(|bytes| String::from_utf8(bytes).map_err(|_| "Font registry must be UTF-8".to_string()))).transpose()?;
    let icons_json = projection.entries.iter().find(|entry| entry.path.eq_ignore_ascii_case(".opencard/icons/icons.json")).map(|entry| read_zip_entry(&mut projection.archive, entry.index, MAX_MANIFEST_BYTES).and_then(|bytes| String::from_utf8(bytes).map_err(|_| "Icon registry must be UTF-8".to_string()))).transpose()?;
    let content_hash = hash_projection(&mut projection)?;
    let target = package_target(&root, &target_key);
    validate_existing_target(&root, &target)?;
    let existing_manifest_path = target.join(MANIFEST_PATH);
    let existing_manifest_json = std::fs::read_to_string(&existing_manifest_path).ok();
    let existing_projection = if target.exists() { Some(fingerprint(&target)?) } else { None };
    let existing_fingerprint = existing_projection.as_ref().map(|value| value.0.clone());
    let entry_paths = projection.entries.iter().map(|entry| entry.path.clone()).collect();
    Ok(NativeResourcePackageInspection { manifest_json, content_hash, existing_manifest_json, existing_fingerprint, entry_count: projection.entries.len() + 1, unpacked_bytes: projection.unpacked_bytes, entry_paths, fonts_json, icons_json })
}

/// Windows 上刚写出成百上千个文件后立刻换目录/删目录，会被杀毒软件或索引器的短暂占住挡成
/// "拒绝访问"（os error 5）；稍等重试通常就过去了。其它错误直接返回，不掩盖真实问题。
fn retry_access_denied<T>(mut operation: impl FnMut() -> std::io::Result<T>) -> std::io::Result<T> {
    let mut denied = None;
    for attempt in 0..5 {
        match operation() {
            Ok(value) => return Ok(value),
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
                denied = Some(error);
                std::thread::sleep(std::time::Duration::from_millis(50 * (attempt + 1)));
            }
            Err(error) => return Err(error),
        }
    }
    Err(denied.expect("a denied attempt was recorded"))
}

#[tauri::command]
pub async fn install_resource_package(request: InstallResourcePackageRequest) -> Result<NativeResourcePackageInstallResult, String> {
    // 先做只读检查（这里没有锁，因为 await 不能跨越 std::sync 的锁）；
    // 真正改动项目之前再上锁，锁内会重新校验一次哈希，所以不会放松一致性。
    let target_key = normalize_package_key(&request.target_key)?;
    let inspected = inspect_resource_package(InspectResourcePackageRequest { project_root_path: request.project_root_path.clone(), source_path: request.source_path.clone(), target_key: Some(target_key.clone()) }).await?;
    if inspected.content_hash != request.expected_content_hash { return Err("Package source changed since inspection".to_string()); }
    if inspected.existing_fingerprint != request.expected_existing_fingerprint { return Err("Installed package changed since inspection".to_string()); }
    let (canonical_key, _) = manifest_identity(&request.manifest_json)?;
    let canonical_value: serde_json::Value = serde_json::from_str(&request.manifest_json).map_err(|_| "Validated manifest is invalid JSON".to_string())?;
    if canonical_key != target_key || canonical_value.get("contentHash").and_then(|value| value.as_str()) != Some(inspected.content_hash.as_str()) { return Err("Validated manifest does not match the inspected package".to_string()); }
    let _guard = PACKAGE_MUTATION_LOCK.get_or_init(|| Mutex::new(())).lock().map_err(|_| "Package mutation lock is poisoned".to_string())?;
    let root = canonical_project_root(&request.project_root_path)?;
    let packages = root.join(".opencard").join("packages"); std::fs::create_dir_all(&packages).map_err(|e| e.to_string())?;
    let canonical_packages = std::fs::canonicalize(&packages).map_err(|e| e.to_string())?;
    if !canonical_packages.starts_with(&root) { return Err("Package directory escapes the project root".to_string()); }
    let target = package_target(&root, &target_key);
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let staging = packages.join(format!("{}.install-{}", target_key, stamp));
    let backup = packages.join(format!("{}.backup-{}", target_key, stamp));
    let mut projection = open_archive(&std::fs::canonicalize(&request.source_path).map_err(|e| e.to_string())?)?;
    if hash_projection(&mut projection)? != request.expected_content_hash { return Err("Package source changed before extraction".to_string()); }
    std::fs::create_dir_all(&staging).map_err(|e| format!("Cannot create the package staging directory: {e}"))?;
    let manifest_path = staging.join(MANIFEST_PATH); std::fs::create_dir_all(manifest_path.parent().unwrap()).map_err(|e| format!("Cannot create the package staging directory: {e}"))?;
    std::fs::write(&manifest_path, request.manifest_json.as_bytes()).map_err(|e| format!("Cannot write the staged manifest: {e}"))?;
    for entry in projection.entries.clone() {
        let mut zip_file = projection.archive.by_index(entry.index).map_err(|e| e.to_string())?;
        let destination = staging.join(&entry.path); if let Some(parent) = destination.parent() { std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create the directory for {}: {e}", entry.path))?; }
        let mut out = File::create(&destination).map_err(|e| format!("Cannot write {}: {e}", entry.path))?; std::io::copy(&mut zip_file, &mut out).map_err(|e| format!("Cannot write {}: {e}", entry.path))?;
    }
    let replaced = target.exists();
    if replaced { retry_access_denied(|| std::fs::rename(&target, &backup)).map_err(|e| format!("Cannot move the installed package aside: {e}"))?; }
    if let Err(error) = std::fs::rename(&staging, &target) { if replaced { let _ = std::fs::rename(&backup, &target); } return Err(format!("Cannot move the staged package into place: {error}")); }
    if replaced { retry_access_denied(|| std::fs::remove_dir_all(&backup)).map_err(|e| format!("Cannot remove the previous package: {e}"))?; }
    let installed_fingerprint = fingerprint(&target)?.0;
    Ok(NativeResourcePackageInstallResult { target_path: target.to_string_lossy().to_string(), replaced, fingerprint: installed_fingerprint })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_paths_reject_platform_traps() {
        for path in [b"../escape".as_slice(), b"fonts\\bad.ttf", b"CON", b"font.ttf.", b"a//b"] {
            assert!(normalize_archive_path(path).is_err(), "accepted {:?}", path);
        }
        assert_eq!(normalize_archive_path(b".opencard/fonts/fonts.json").unwrap(), ".opencard/fonts/fonts.json");
    }

    #[test]
    fn manifest_identity_requires_current_shape_identity() {
        assert_eq!(manifest_identity(r#"{"key":"Theme","version":"1.2.3"}"#).unwrap(), ("theme".to_string(), "1.2.3".to_string()));
        assert!(manifest_identity("{}").is_err());
    }

    #[test]
    fn package_keys_are_single_portable_segments() {
        assert_eq!(normalize_package_key(" Owner-Repo ").unwrap(), "owner-repo");
        assert_eq!(normalize_package_key("alice.my_theme-2").unwrap(), "alice.my_theme-2");
        for key in ["", "owner/repo", "../escape", "-lead", "空 格"] {
            assert!(normalize_package_key(key).is_err(), "accepted {:?}", key);
        }
    }
}
