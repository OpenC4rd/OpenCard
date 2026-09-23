//! 资源包打包：读源文件、边写边算内容哈希、直接落盘。
//!
//! 打包放在 Rust 侧是为了避开前端逐文件 IPC 与主线程压缩：前端只给"源路径 → 包内路径"的清单，
//! 这里负责读取、压缩（已压缩资源直接 store）与写入，并按文件回报进度。
//! 内容哈希沿用 `resource_package.rs` 里校验时用的同一套拼接规则（标签 + 路径长度 + 路径 + 内容长度 + 内容，
//! 按包内路径排序、指纹纸条除外），算出来的值写进包里的 `.opencard/fingerprint.txt`。

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tauri::{AppHandle, Emitter};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::resource_package::{hash_entry_preamble, normalize_archive_path, CONTENT_HASH_TAG, MAX_PATH_BYTES};

const MANIFEST_PATH: &str = ".opencard/manifest.json";
const FINGERPRINT_PATH: &str = ".opencard/fingerprint.txt";
const PROGRESS_EVENT: &str = "resource-package-build-progress";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackageBuildFile {
    pub source_path: String,
    pub archive_path: String,
    /// 已压缩过的资源（图片、字体）不再 deflate，省 CPU 且体积几乎不变。
    #[serde(default)]
    pub stored: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackageBuildText {
    pub archive_path: String,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackageBuildPublicFont {
    pub key: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackageBuildPublicIconSeries {
    pub key: String,
    pub title: String,
    pub count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackageBuildRequest {
    pub output_path: String,
    /// 身份：作者与包名都是小写 slug，版本是精确 semver。它由打包界面填，
    /// 因为在包外面没有任何东西能替它说清楚自己是谁 —— 文件名不算数。
    pub author: String,
    pub name: String,
    pub version: String,
    /// 给人看的名字。留空就回落成包名。
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub files: Vec<ResourcePackageBuildFile>,
    #[serde(default)]
    pub texts: Vec<ResourcePackageBuildText>,
    #[serde(default)]
    pub public_fonts: Vec<ResourcePackageBuildPublicFont>,
    #[serde(default)]
    pub public_icon_series: Vec<ResourcePackageBuildPublicIconSeries>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackageBuildResult {
    pub output_path: String,
    pub fingerprint: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BuildProgress {
    done: usize,
    total: usize,
}

/// 写包时的条目表：文本（注册表、词典）与资源文件混排，按包内路径排序后顺序写入。
enum PlannedEntry {
    Text { archive_path: String, bytes: Vec<u8> },
    File { archive_path: String, source_path: String, size: u64, stored: bool },
}

impl PlannedEntry {
    fn archive_path(&self) -> &str {
        match self {
            PlannedEntry::Text { archive_path, .. } => archive_path,
            PlannedEntry::File { archive_path, .. } => archive_path,
        }
    }
}

fn zip_error(error: impl std::fmt::Display) -> String {
    format!("Cannot write package: {error}")
}

fn archive_entry_path(value: &str) -> Result<String, String> {
    normalize_archive_path(value.as_bytes())
}

/// 清单就是包对外的全部自述：我是谁，以及我公开哪些字体与图标。
/// 它参与内容哈希，所以这里不能写任何由内容推导出来的值 —— 指纹因此不在这里，
/// 而是单独那张纸条。
fn build_manifest(request: &ResourcePackageBuildRequest) -> serde_json::Value {
    let mut manifest = serde_json::json!({
        "type": "opencard-resource-package",
        "author": request.author,
        "name": request.name,
        "version": request.version,
        "title": request.title,
        "public": {
            "fonts": request.public_fonts
                .iter()
                .map(|font| serde_json::json!({ "key": font.key, "title": font.title }))
                .collect::<Vec<_>>(),
            "iconSeries": request.public_icon_series
                .iter()
                .map(|series| serde_json::json!({ "key": series.key, "title": series.title, "count": series.count }))
                .collect::<Vec<_>>(),
        },
    });
    if let Some(cover) = &request.cover {
        manifest["cover"] = serde_json::json!(cover);
    }
    manifest
}

/// 源文件不在这里做存在性检查：读取失败本身就是"文件不在了"的答案，少一次往返。
#[tauri::command]
pub async fn build_resource_package(
    app: AppHandle,
    request: ResourcePackageBuildRequest,
) -> Result<ResourcePackageBuildResult, String> {
    let output_path = request.output_path.clone();
    let output = Path::new(&output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("Cannot create package folder: {error}"))?;
    }

    // 所有条目合成一张表并按包内路径全局排序：读的那侧也是按包内路径排序后算哈希的，
    // 分组写（文本先、文件后）会让两边算出不同的哈希。
    // 清单可以先构造出来，作为这张表里的一员参与排序与哈希；指纹纸条不在这张表里 ——
    // 它的内容取决于表里所有条目，所以只能等它们都写完再算。
    let manifest_text = build_manifest(&request).to_string();
    let mut entries: Vec<PlannedEntry> = Vec::with_capacity(request.files.len() + request.texts.len() + 1);
    entries.push(PlannedEntry::Text {
        archive_path: MANIFEST_PATH.to_string(),
        bytes: manifest_text.into_bytes(),
    });
    for text in &request.texts {
        entries.push(PlannedEntry::Text {
            archive_path: archive_entry_path(&text.archive_path)?,
            bytes: text.text.as_bytes().to_vec(),
        });
    }
    for file in &request.files {
        let archive_path = archive_entry_path(&file.archive_path)?;
        let size = std::fs::metadata(&file.source_path)
            .map_err(|error| format!("Cannot read {archive_path}: {error}"))?
            .len();
        entries.push(PlannedEntry::File {
            archive_path,
            source_path: file.source_path.clone(),
            size,
            stored: file.stored,
        });
    }
    entries.sort_by(|left, right| left.archive_path().cmp(right.archive_path()));
    // 重复路径会让归档自相矛盾。清单现在也是这张表里的一员，所以这里必须挡住。
    for pair in entries.windows(2) {
        if pair[0].archive_path().eq_ignore_ascii_case(pair[1].archive_path()) {
            return Err(format!("Duplicate package path: {}", pair[0].archive_path()));
        }
    }

    let part_path = format!("{output_path}.part");
    let mut digest = Sha256::new();
    digest.update(CONTENT_HASH_TAG);
    {
        let file = File::create(&part_path).map_err(|error| format!("Cannot create package: {error}"))?;
        let mut writer = ZipWriter::new(file);
        let mut buffer = vec![0_u8; 64 * 1024];
        let total = entries.len();
        let mut done = 0_usize;

        let mut write_entry = |writer: &mut ZipWriter<File>,
                               digest: &mut Sha256,
                               path: &str,
                               size: u64,
                               read: &mut dyn Read,
                               deflated: bool|
         -> Result<(), String> {
            let options = SimpleFileOptions::default().compression_method(if deflated {
                CompressionMethod::Deflated
            } else {
                CompressionMethod::Stored
            });
            writer.start_file(path, options).map_err(zip_error)?;
            if path.as_bytes().len() > MAX_PATH_BYTES {
                return Err(format!("Package path is too long: {path}"));
            }
            // 与校验侧同一份写法，两边不会各算各的。
            hash_entry_preamble(digest, path, size);
            let mut written = 0_u64;
            loop {
                let count = read.read(&mut buffer).map_err(|error| format!("Cannot read source file: {error}"))?;
                if count == 0 {
                    break;
                }
                written += count as u64;
                if written > size {
                    return Err(format!("Source file grew while packing: {path}"));
                }
                digest.update(&buffer[..count]);
                writer.write_all(&buffer[..count]).map_err(zip_error)?;
            }
            if written != size {
                return Err(format!("Source file changed while packing: {path}"));
            }
            Ok(())
        };

        for entry in &entries {
            match entry {
                PlannedEntry::Text { archive_path, bytes } => {
                    let mut cursor: &[u8] = bytes;
                    write_entry(&mut writer, &mut digest, archive_path, bytes.len() as u64, &mut cursor, true)?;
                }
                PlannedEntry::File { archive_path, source_path, size, stored } => {
                    let mut source = File::open(source_path)
                        .map_err(|error| format!("Cannot read {archive_path}: {error}"))?;
                    write_entry(&mut writer, &mut digest, archive_path, *size, &mut source, !*stored)?;
                }
            }
            done += 1;
            let _ = app.emit(PROGRESS_EVENT, BuildProgress { done, total });
        }

        // 指纹纸条最后写。归档里的先后顺序不影响哈希：读的那侧按包内路径重排，
        // 并按路径把纸条自己排除在外。
        let fingerprint = format!("{:x}", digest.finalize());
        let note = format!("{fingerprint}\n");
        writer
            .start_file(FINGERPRINT_PATH, SimpleFileOptions::default().compression_method(CompressionMethod::Stored))
            .map_err(zip_error)?;
        writer.write_all(note.as_bytes()).map_err(zip_error)?;

        writer.finish().map_err(zip_error)?;

        std::fs::rename(&part_path, output).map_err(|error| format!("Cannot finish package: {error}"))?;
        Ok(ResourcePackageBuildResult { output_path, fingerprint })
    }
}
