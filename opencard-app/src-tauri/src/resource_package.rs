//! 资源包归档的读取与解开。
//!
//! 一个 `.ocpack` 就是一个 zip。包在 `.opencard/manifest.json` 里自述身份，并带一张
//! `.opencard/fingerprint.txt` 指纹纸条：包内所有文件内容算出来的 sha256。纸条自己不算在内，
//! 所以"内容一样 → 指纹一样"，与压缩方式、写入时间、条目顺序无关。
//!
//! 两件事分开：
//! - [`read_resource_package`] 只随机访问 zip 中央目录里的两个小条目，**不解开**就知道包是谁、
//!   指纹是什么；它不需要知道缓存在哪。
//! - [`unpack_resource_package`] 才真正落到包缓存根下的 `<指纹>/`。目录名就是指纹，
//!   所以同一个包被多少个项目用到都只解一次；两个不同的包不可能撞进同一个目录。
//!
//! 解开是派生的：缓存删掉不影响任何东西，下次用到会重新解一遍。
//!
//! 缓存根由调用方（前端）传入 —— 布局只有一个出口（`src/shared/storage/appStoragePaths.ts`），
//! 这里不拼 `.opencard`。根**内部**的一切由本模块拥有，包括集合目录里的 `index.json`。

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
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
/// 指纹纸条：一行 `sha256:<64 位十六进制>`。它自己必须被排除在内容哈希之外，
/// 否则纸条的内容会改变它自己声称的那个值。
const FINGERPRINT_PATH: &str = ".opencard/fingerprint.txt";
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_FINGERPRINT_BYTES: u64 = 4096;

/// 内容哈希的域分隔标签。标签尾的版本位随哈希输入集合的改变而递增：
/// 指纹纸条从"不存在"变为"存在但被排除"，因此这里是 v3。
pub(crate) const CONTENT_HASH_TAG: &[u8] = b"opencard-resource-package-content\0v3\n";

/// 集合目录里的簿记：每个包最后一次被用到的时刻与占用字节数。
/// 它放在集合目录里、而不是放进每个包目录 —— 包目录里多一个文件会让"包内文件清单"这句话不准确。
const INDEX_FILE_NAME: &str = "index.json";
const MAX_CACHE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// 解压到一半的目录以 `.` 开头，而指纹永远是十六进制，所以两者不会相撞。
const STAGING_PREFIX: &str = ".unpack-";

static PACKAGE_MUTATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResourcePackageRequest {
    pub source_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourcePackageInspection {
    pub manifest_json: String,
    /// 包自己声明的指纹。它是声明，不是证明 —— 解开时才会重算一遍对账。
    pub fingerprint: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnpackResourcePackageRequest {
    pub source_path: String,
    /// 调用方读到的指纹。归档在读取之后被换掉的话，这里就对不上了。
    pub fingerprint: String,
    /// 包缓存根（`<软件存储>/cache/packages`）。
    pub packages_root: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourcePackageUnpack {
    pub root_path: String,
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
    fingerprint_index: Option<usize>,
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

/// 打开归档并把条目表读出来，但不解压任何内容。安全检查在这里一次做完，
/// 后面的读取与解开都基于这张已经验证过的表。
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
    let mut fingerprint_index = None;
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
        } else if identity == FINGERPRINT_PATH {
            if size > MAX_FINGERPRINT_BYTES {
                return Err("Package fingerprint is too large".to_string());
            }
            fingerprint_index = Some(index);
        }
        entries.push(ArchiveEntry { index, path, size });
    }
    let manifest_index = manifest_index.ok_or_else(|| "Package manifest is missing".to_string())?;
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(ArchiveProjection { archive, entries, manifest_index, fingerprint_index })
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

fn manifest_text(projection: &mut ArchiveProjection) -> Result<String, String> {
    let bytes = read_zip_entry(&mut projection.archive, projection.manifest_index, MAX_MANIFEST_BYTES)?;
    String::from_utf8(bytes).map_err(|_| "Package manifest must be UTF-8".to_string())
}

fn declared_fingerprint(projection: &mut ArchiveProjection) -> Result<String, String> {
    let index = projection.fingerprint_index
        .ok_or_else(|| "Package fingerprint is missing".to_string())?;
    let bytes = read_zip_entry(&mut projection.archive, index, MAX_FINGERPRINT_BYTES)?;
    let text = String::from_utf8(bytes).map_err(|_| "Package fingerprint must be UTF-8".to_string())?;
    parse_fingerprint(&text).ok_or_else(|| "Package fingerprint is invalid".to_string())
}

/// 纸条的内容是 `sha256:<64 位十六进制>`。带算法前缀是为了将来换算法时不必改文件布局。
pub(crate) fn parse_fingerprint(text: &str) -> Option<String> {
    let text = text.trim();
    if !text.get(..7)?.eq_ignore_ascii_case("sha256:") {
        return None;
    }
    let value = text.get(7..)?;
    (value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then(|| value.to_ascii_lowercase())
}

/// 内容哈希里一条条目的开头：`路径长度 u64 BE | 路径 | 内容长度 u64 BE`，后面接内容本身。
/// 打包与校验共用这一份 —— 规则要是两边各写一遍，迟早会算出两个不同的值。
pub(crate) fn hash_entry_preamble(digest: &mut Sha256, path: &str, size: u64) {
    let path = path.as_bytes();
    digest.update((path.len() as u64).to_be_bytes());
    digest.update(path);
    digest.update(size.to_be_bytes());
}

/// 这条条目参不参与内容哈希。指纹纸条按路径排除在外 —— 它记录的就是这个值。
pub(crate) fn is_hashed_entry(path: &str) -> bool {
    !path.eq_ignore_ascii_case(FINGERPRINT_PATH)
}

/// 包内所有文件内容的哈希。规则与打包侧完全一致：按包内路径排序，逐条喂入
/// [`hash_entry_preamble`] 与内容本身，并在最前面加上域分隔标签。
fn hash_projection(projection: &mut ArchiveProjection) -> Result<String, String> {
    let mut digest = Sha256::new();
    digest.update(CONTENT_HASH_TAG);
    let entries = projection.entries.clone();
    let mut buffer = [0_u8; 64 * 1024];
    for entry in entries {
        if !is_hashed_entry(&entry.path) {
            continue;
        }
        hash_entry_preamble(&mut digest, &entry.path, entry.size);
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

/// 缓存根来自前端，所以这里确认它是绝对路径：相对路径会落在进程的工作目录上，
/// 那是"缓存跑到了谁都找不到的地方"，不是可以接受的降级。
fn absolute_packages_root(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err("The package cache root must be an absolute path".to_string());
    }
    Ok(path)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// 集合目录里的簿记。`lastUsedAt` 是清理时排序的依据，`bytes` 让它不必再递归遍历目录树。
#[derive(Debug, Default, Clone, Deserialize, Serialize)]
struct PackageCacheEntry {
    #[serde(default, rename = "lastUsedAt")]
    last_used_at: u64,
    #[serde(default)]
    bytes: u64,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct PackageCacheIndex {
    #[serde(default)]
    packages: HashMap<String, PackageCacheEntry>,
}

fn index_file_path(packages_root: &Path) -> PathBuf {
    packages_root.join(INDEX_FILE_NAME)
}

/// 索引丢了不该拦住解开：它只决定清理时先删谁。
fn read_index(packages_root: &Path) -> PackageCacheIndex {
    std::fs::read_to_string(index_file_path(packages_root))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// 索引写不进去也一样不拦：下一次用到会重新记，最坏情况只是清理顺序不准。
fn write_index(packages_root: &Path, index: &PackageCacheIndex) {
    if let Ok(text) = serde_json::to_string(index) {
        let _ = std::fs::write(index_file_path(packages_root), text);
    }
}

/// 记下"这个包刚被用到"。`bytes` 为 `None` 表示这次不知道它多大（命中了已解开的目录），
/// 那就保留索引里的旧值。
fn touch_usage(packages_root: &Path, fingerprint: &str, bytes: Option<u64>) {
    let mut index = read_index(packages_root);
    let entry = index.packages.entry(fingerprint.to_string()).or_default();
    entry.last_used_at = now_millis();
    if let Some(bytes) = bytes {
        entry.bytes = bytes;
    }
    write_index(packages_root, &index);
}

fn directory_bytes(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    let mut total = 0_u64;
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else { continue };
        if metadata.is_dir() {
            total = total.saturating_add(directory_bytes(&entry.path()));
        } else {
            total = total.saturating_add(metadata.len());
        }
    }
    total
}

/// 半个解压目录是进程被中断时留下的，直接删；用户手删缓存也不需要任何恢复。
fn recover_unpacking(packages_root: &Path) -> Result<(), String> {
    let entries = match std::fs::read_dir(packages_root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Cannot read the package cache: {error}")),
    };
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
        if name.starts_with(STAGING_PREFIX) || name.ends_with(".tmp") {
            let _ = retry_access_denied(|| std::fs::remove_dir_all(&path));
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

/// 超过上限就按"最后一次用到"从旧到新删，直到降回上限以内。刚解开的那一份永远留下 ——
/// 它正是这次调用的目的。
///
/// 字节数从索引里读，不再每次启动递归遍历整棵树；索引里没有记录的条目量一次并补记，
/// 那次之后就不用再量。
fn prune_cache(packages_root: &Path, keep: &str, max_bytes: u64) -> Result<(), String> {
    let entries = match std::fs::read_dir(packages_root) {
        Ok(entries) => entries,
        // 还没有任何包被解开过：没有东西要清，这不是错误。
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Cannot read the package cache: {error}")),
    };
    let mut index = read_index(packages_root);
    let mut packages: Vec<(String, PathBuf, u64, u64)> = Vec::new();
    for entry in entries {
        let path = entry.map_err(|error| error.to_string())?.path();
        if !path.is_dir() { continue; }
        let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("").to_string();
        if name.starts_with('.') { continue; }
        let recorded = index.packages.get(&name).cloned().unwrap_or_default();
        let bytes = if recorded.bytes > 0 {
            recorded.bytes
        } else {
            let measured = directory_bytes(&path);
            index.packages.entry(name.clone()).or_default().bytes = measured;
            measured
        };
        packages.push((name, path, bytes, recorded.last_used_at));
    }
    // 目录已经不在的条目留着只会让簿记和磁盘对不上，顺手清掉。
    // 反过来，目录在、索引里没有的条目是"内容寻址的自己人"：目录名就是指纹，补记下来即可。
    let present = packages.iter().map(|(name, _, _, _)| name.clone()).collect::<HashSet<_>>();
    index.packages.retain(|name, _| present.contains(name));
    let total = packages.iter().map(|(_, _, bytes, _)| *bytes).sum::<u64>();
    if total <= max_bytes {
        write_index(packages_root, &index);
        return Ok(());
    }
    packages.sort_by_key(|(_, _, _, last_used_at)| *last_used_at);
    let mut remaining = total;
    for (name, path, bytes, _) in packages {
        if remaining <= max_bytes { break; }
        if name == keep { continue; }
        if retry_access_denied(|| std::fs::remove_dir_all(&path)).is_ok() {
            remaining = remaining.saturating_sub(bytes);
            index.packages.remove(&name);
        }
    }
    write_index(packages_root, &index);
    Ok(())
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

/// 解开一个包，并返回实际写出的字节数 —— 索引就是靠它记住"这个包占多大"的。
fn extract_into(projection: &mut ArchiveProjection, staging: &Path) -> Result<u64, String> {
    std::fs::create_dir_all(staging)
        .map_err(|error| format!("Cannot create the package staging directory: {error}"))?;
    let mut written = 0_u64;
    for entry in projection.entries.clone() {
        let mut zip_file = projection.archive.by_index(entry.index)
            .map_err(|error| format!("Cannot read {}: {error}", entry.path))?;
        let destination = staging.join(&entry.path);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Cannot create the directory for {}: {error}", entry.path))?;
        }
        let mut out = File::create(&destination)
            .map_err(|error| format!("Cannot write {}: {error}", entry.path))?;
        let copied = std::io::copy(&mut zip_file, &mut out)
            .map_err(|error| format!("Cannot write {}: {error}", entry.path))?;
        written = written.saturating_add(copied);
    }
    Ok(written)
}

fn unpack_blocking(request: &UnpackResourcePackageRequest) -> Result<NativeResourcePackageUnpack, String> {
    // 同一时刻只允许一次解开：两个项目同时开、各带同一个包时，两边会撞进同一个目标目录。
    let _guard = PACKAGE_MUTATION_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Package mutation lock is poisoned".to_string())?;

    let source = std::fs::canonicalize(&request.source_path)
        .map_err(|error| format!("Cannot access package: {error}"))?;
    let mut projection = open_archive(&source)?;
    let manifest = manifest_text(&mut projection)?;
    let declared = declared_fingerprint(&mut projection)?;
    if declared != request.fingerprint {
        return Err("Package changed since it was inspected".to_string());
    }
    // 纸条是声明，重算是核对：这一步才让"指纹 = 内容"成立，也正因为它成立，
    // 指纹才可以拿去做目录名。
    if hash_projection(&mut projection)? != declared {
        return Err("Package content does not match its fingerprint".to_string());
    }

    let root = absolute_packages_root(&request.packages_root)?;
    std::fs::create_dir_all(&root)
        .map_err(|error| format!("Cannot create the package cache: {error}"))?;
    recover_unpacking(&root)?;
    let target = root.join(&declared);
    if target.is_dir() {
        // 已经解过了。清单对不上说明有另一个内容不同的包自称同一个指纹 —— 那不是一个包。
        let installed = std::fs::read_to_string(target.join(MANIFEST_PATH)).unwrap_or_default();
        if installed != manifest {
            return Err("Package content does not match its fingerprint".to_string());
        }
        // 大小这次不知道；索引里记过的留着，没记过的留给清理那一步量一次。
        touch_usage(&root, &declared, None);
        return Ok(NativeResourcePackageUnpack {
            root_path: target.to_string_lossy().to_string(),
            fingerprint: declared,
        });
    }

    let staging = root.join(format!("{STAGING_PREFIX}{}", now_millis()));
    let _ = std::fs::remove_dir_all(&staging);
    let written = match extract_into(&mut projection, &staging) {
        Ok(written) => written,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    if let Err(error) = std::fs::rename(&staging, &target) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!("Cannot move the unpacked package into place: {error}"));
    }
    touch_usage(&root, &declared, Some(written));
    let _ = prune_cache(&root, &declared, MAX_CACHE_BYTES);
    Ok(NativeResourcePackageUnpack {
        root_path: target.to_string_lossy().to_string(),
        fingerprint: declared,
    })
}

/// 读出包是谁、指纹是什么 —— 不解开归档，也不需要知道缓存在哪。
#[tauri::command]
pub async fn read_resource_package(
    request: ReadResourcePackageRequest,
) -> Result<NativeResourcePackageInspection, String> {
    let source = std::fs::canonicalize(&request.source_path)
        .map_err(|error| format!("Cannot access package: {error}"))?;
    let mut projection = open_archive(&source)?;
    let manifest_json = manifest_text(&mut projection)?;
    let fingerprint = declared_fingerprint(&mut projection)?;
    Ok(NativeResourcePackageInspection { manifest_json, fingerprint })
}

#[tauri::command]
pub async fn unpack_resource_package(
    request: UnpackResourcePackageRequest,
) -> Result<NativeResourcePackageUnpack, String> {
    tauri::async_runtime::spawn_blocking(move || unpack_blocking(&request))
        .await
        .map_err(|error| format!("Cannot unpack the package: {error}"))?
}

/// 应用启动时清一次：删掉中断留下的半个解压目录，并把缓存降回大小上限以内。
#[tauri::command]
pub async fn recover_resource_package_cache(packages_root: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = absolute_packages_root(&packages_root)?;
        recover_unpacking(&root)?;
        prune_cache(&root, "", MAX_CACHE_BYTES)
    })
    .await
    .map_err(|error| format!("Cannot clean the package cache: {error}"))?
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
    fn fingerprints_are_sha256_lines_only() {
        let value = "a".repeat(64);
        // 大小写不敏感：纸条是人能打开看的文件，十六进制的大小写不该决定它读不读得出来。
        assert_eq!(parse_fingerprint(&format!("sha256:{value}\n")).as_deref(), Some(value.as_str()));
        assert_eq!(parse_fingerprint(&format!("sha256:{}", value.to_uppercase())).as_deref(), Some(value.as_str()));
        for text in ["", &value, &format!("sha256:{}", "a".repeat(63)), &format!("sha256:{}", "z".repeat(64))] {
            assert!(parse_fingerprint(text).is_none(), "accepted {:?}", text);
        }
    }

    /// 按"包内路径排序 + 域标签 + 路径长度/路径/内容长度/内容、纸条除外"独立算一遍指纹。
    /// 这里**故意**把字节布局照抄一遍：它冻结的是包格式本身，改坏了这条测试就该红。
    fn expected_fingerprint(entries: &[(&str, &str)]) -> String {
        let mut hashed = entries.iter()
            .filter(|(path, _)| !path.eq_ignore_ascii_case(FINGERPRINT_PATH))
            .collect::<Vec<_>>();
        hashed.sort_by(|left, right| left.0.cmp(right.0));
        let mut digest = Sha256::new();
        digest.update(CONTENT_HASH_TAG);
        for (path, content) in hashed {
            digest.update((path.len() as u64).to_be_bytes());
            digest.update(path.as_bytes());
            digest.update((content.len() as u64).to_be_bytes());
            digest.update(content.as_bytes());
        }
        format!("{:x}", digest.finalize())
    }

    fn write_package(path: &Path, entries: &[(&str, &str)], note: Option<&str>) {
        use std::io::Write;
        use zip::write::SimpleFileOptions;
        use zip::{CompressionMethod, ZipWriter};

        let mut writer = ZipWriter::new(File::create(path).unwrap());
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (entry_path, content) in entries {
            writer.start_file(*entry_path, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        if let Some(note) = note {
            writer.start_file(FINGERPRINT_PATH, options).unwrap();
            writer.write_all(note.as_bytes()).unwrap();
        }
        writer.finish().unwrap();
    }

    fn temp_package_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("opencard-{name}-{}.ocpack", now_millis()))
    }

    #[test]
    fn the_note_is_the_content_hash_of_everything_else_in_the_package() {
        let entries = [
            (MANIFEST_PATH, "{\"name\":\"t\"}"),
            (".opencard/fonts/fonts.json", "{}"),
            ("fonts/a.ttf", "aaaa"),
        ];
        let expected = expected_fingerprint(&entries);

        let path = temp_package_path("fingerprint");
        write_package(&path, &entries, Some(&format!("sha256:{expected}\n")));
        let mut projection = open_archive(&path).unwrap();
        assert_eq!(declared_fingerprint(&mut projection).unwrap(), expected);
        assert_eq!(hash_projection(&mut projection).unwrap(), expected);

        // 纸条换成别的值，算出来的还是同一个 —— 它自己被排除在内容之外。
        let rewritten = temp_package_path("fingerprint-rewritten");
        let zeroes = format!("sha256:{}\n", "0".repeat(64));
        write_package(&rewritten, &entries, Some(&zeroes));
        let mut rewritten_projection = open_archive(&rewritten).unwrap();
        assert_eq!(declared_fingerprint(&mut rewritten_projection).unwrap(), "0".repeat(64));
        assert_eq!(hash_projection(&mut rewritten_projection).unwrap(), expected);

        // 写入顺序不影响值：按包内路径排序是规则的一部分。
        let shuffled = temp_package_path("fingerprint-shuffled");
        write_package(&shuffled, &[entries[2], entries[0], entries[1]], Some(&format!("sha256:{expected}\n")));
        let mut shuffled_projection = open_archive(&shuffled).unwrap();
        assert_eq!(hash_projection(&mut shuffled_projection).unwrap(), expected);

        for path in [path, rewritten, shuffled] {
            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn a_package_without_a_readable_note_is_not_a_package() {
        let entries = [(MANIFEST_PATH, "{}")];
        let missing = temp_package_path("no-fingerprint");
        write_package(&missing, &entries, None);
        let mut missing_projection = open_archive(&missing).unwrap();
        assert!(declared_fingerprint(&mut missing_projection).is_err());

        let blank = temp_package_path("blank-fingerprint");
        write_package(&blank, &entries, Some("\n"));
        let mut blank_projection = open_archive(&blank).unwrap();
        assert!(declared_fingerprint(&mut blank_projection).is_err());

        for path in [missing, blank] {
            let _ = std::fs::remove_file(path);
        }
    }

    /// 造一个假缓存根：每个名字一个目录，里面一个若干字节的文件。
    fn temp_cache_root(name: &str, packages: &[(&str, u64)]) -> PathBuf {
        let root = std::env::temp_dir().join(format!("opencard-cache-{name}-{}", now_millis()));
        let _ = std::fs::remove_dir_all(&root);
        for (package, bytes) in packages {
            let directory = root.join(package);
            std::fs::create_dir_all(&directory).unwrap();
            std::fs::write(directory.join("payload"), vec![0_u8; *bytes as usize]).unwrap();
        }
        root
    }

    #[test]
    fn prune_drops_the_least_recently_used_package_and_never_the_one_in_use() {
        let root = temp_cache_root("prune", &[("old", 400), ("middle", 400), ("recent", 400)]);
        let mut index = PackageCacheIndex::default();
        for (package, last_used_at) in [("old", 1_u64), ("middle", 2), ("recent", 3)] {
            index.packages.insert(package.to_string(), PackageCacheEntry { last_used_at, bytes: 400 });
        }
        write_index(&root, &index);

        // 上限只够两份：最久没用的 "old" 先走。
        prune_cache(&root, "", 800).unwrap();
        assert!(!root.join("old").exists());
        assert!(root.join("middle").is_dir());
        assert!(root.join("recent").is_dir());
        assert!(!read_index(&root).packages.contains_key("old"));

        // 正在解开的那一份永远留下，即使它是最久没用的那个。
        prune_cache(&root, "middle", 0).unwrap();
        assert!(root.join("middle").is_dir());
        assert!(!root.join("recent").exists());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn the_index_backfills_missing_sizes_and_tolerates_a_broken_file() {
        let root = temp_cache_root("index", &[("known", 5), ("legacy", 7)]);

        // 没有任何索引时，清理顺手把每个包的字节数量一次并记下来。
        prune_cache(&root, "", u64::MAX).unwrap();
        let index = read_index(&root);
        assert_eq!(index.packages.get("known").unwrap().bytes, 5);
        assert_eq!(index.packages.get("legacy").unwrap().bytes, 7);

        // 索引读不出来只是一份空索引：不报错，也不因为读不出来就删掉缓存。
        std::fs::write(index_file_path(&root), "{ broken").unwrap();
        assert!(read_index(&root).packages.is_empty());
        prune_cache(&root, "", u64::MAX).unwrap();
        assert!(root.join("known").is_dir());
        assert!(root.join("legacy").is_dir());

        // 目录已经不在的条目随这次清理消失，磁盘上的两个包不受影响。
        let mut stale = read_index(&root);
        stale.packages.insert("vanished".to_string(), PackageCacheEntry { last_used_at: 9, bytes: 123 });
        write_index(&root, &stale);
        prune_cache(&root, "", u64::MAX).unwrap();
        let after = read_index(&root);
        assert!(!after.packages.contains_key("vanished"));
        assert!(after.packages.contains_key("known") && after.packages.contains_key("legacy"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn pruning_a_cache_that_does_not_exist_yet_is_not_a_failure() {
        let root = std::env::temp_dir().join(format!("opencard-cache-absent-{}", now_millis()));
        let _ = std::fs::remove_dir_all(&root);

        // 全新安装、或者刚被手工删掉缓存目录时，启动维护不该因此报错。
        assert!(prune_cache(&root, "", MAX_CACHE_BYTES).is_ok());
        assert!(recover_unpacking(&root).is_ok());
    }

    /// 解开这一条路以前只能靠人手点一次界面来验证。现在 `unpack_blocking` 只吃请求，
    /// 所以"目录名是指纹、包目录里没有簿记、簿记在集合目录里且记着真实字节数"可以在测试里说清。
    #[test]
    fn unpacking_lands_on_the_fingerprint_and_records_its_size_in_the_collection_index() {
        let entries = [(MANIFEST_PATH, "{\"name\":\"t\"}"), ("fonts/a.ttf", "aaaa")];
        let fingerprint = expected_fingerprint(&entries);
        let archive = temp_package_path("unpack");
        write_package(&archive, &entries, Some(&format!("sha256:{fingerprint}\n")));

        let root = std::env::temp_dir().join(format!("opencard-cache-unpack-{}", now_millis()));
        let _ = std::fs::remove_dir_all(&root);
        let request = || UnpackResourcePackageRequest {
            source_path: archive.to_string_lossy().to_string(),
            fingerprint: fingerprint.clone(),
            packages_root: root.to_string_lossy().to_string(),
        };

        let unpacked = unpack_blocking(&request()).unwrap();
        let package_root = root.join(&fingerprint);
        assert_eq!(unpacked.root_path, package_root.to_string_lossy().to_string());
        assert!(package_root.join(MANIFEST_PATH).is_file());
        // 包目录里只有包自己的文件：簿记不能混进去，否则"包内文件清单"就不准确了。
        assert!(!package_root.join(INDEX_FILE_NAME).exists());

        let index = read_index(&root);
        let entry = index.packages.get(&fingerprint).unwrap();
        // 记下的字节数必须等于磁盘上真实的大小，否则淘汰时的账目就是假的。
        assert_eq!(entry.bytes, directory_bytes(&package_root));
        assert!(entry.bytes > 0);
        assert!(entry.last_used_at > 0);

        // 再解一次是幂等的：位置不变，也不重复记账。
        let again = unpack_blocking(&request()).unwrap();
        assert_eq!(again.root_path, unpacked.root_path);
        assert_eq!(read_index(&root).packages.get(&fingerprint).unwrap().bytes, entry.bytes);

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_file(&archive);
    }
}
