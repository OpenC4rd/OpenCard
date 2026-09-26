//! 软件存储的度量：只按调用方给的绝对路径现量目录占用。
//!
//! `cache/` 之下叫什么由前端 `shared/storage/appStoragePaths` 决定，这里不认识任何目录名，
//! 也不读写布局本身。度量只用来给人看，所以读不出来的条目按 0 算，不报错。

use std::path::{Path, PathBuf};

/// 一个目录自身占用的字节数，递归。
pub(crate) fn directory_bytes(path: &Path) -> u64 {
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

/// 按传入顺序返回每个目录的占用；不存在的目录算 0。
#[tauri::command]
pub async fn measure_directories_bytes(directories: Vec<String>) -> Result<Vec<u64>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        directories
            .iter()
            .map(|directory| {
                let path = PathBuf::from(directory);
                if path.is_dir() { directory_bytes(&path) } else { 0 }
            })
            .collect()
    })
    .await
    .map_err(|error| format!("Cannot measure the app storage: {error}"))
}
