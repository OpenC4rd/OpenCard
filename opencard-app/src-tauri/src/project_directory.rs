use serde::Serialize;
use std::{collections::HashMap, fs::ReadDir, sync::{Arc, Mutex}};
use tauri::State;

#[derive(Default)]
pub struct DirectoryScans(Arc<Mutex<HashMap<String, Arc<Mutex<ReadDir>>>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    name: String,
    is_directory: bool,
    is_file: bool,
    is_symlink: bool,
}

#[derive(Serialize)]
pub struct DirectoryBatch {
    entries: Vec<DirectoryEntry>,
    done: bool,
}

impl DirectoryScans {
    fn read(&self, path: &str, request_id: &str) -> Result<DirectoryBatch, String> {
        let existing = self.0.lock().unwrap().get(request_id).cloned();
        let cursor = if let Some(cursor) = existing { cursor } else {
            let cursor = Arc::new(Mutex::new(std::fs::read_dir(path).map_err(|e| e.to_string())?));
            self.0.lock().unwrap().insert(request_id.to_owned(), cursor.clone());
            cursor
        };
        let mut reader = cursor.lock().unwrap();
        let mut entries = Vec::with_capacity(256);
        let mut done = false;
        for _ in 0..256 {
            let Some(entry) = reader.next() else { done = true; break };
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            entries.push(DirectoryEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                is_directory: kind.is_dir(), is_file: kind.is_file(), is_symlink: kind.is_symlink(),
            });
        }
        if done { self.0.lock().unwrap().remove(request_id); }
        Ok(DirectoryBatch { entries, done })
    }
}

#[tauri::command]
pub async fn read_project_directory(
    path: String,
    request_id: String,
    state: State<'_, DirectoryScans>,
) -> Result<DirectoryBatch, String> {
    let scans = DirectoryScans(state.0.clone());
    tauri::async_runtime::spawn_blocking(move || scans.read(&path, &request_id))
        .await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cancel_project_directory(request_id: String, state: State<'_, DirectoryScans>) {
    state.0.lock().unwrap().remove(&request_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enumerates_one_level_in_bounded_pages_and_releases_cursors() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..513 { std::fs::write(root.path().join(format!("item-{index}")), "").unwrap(); }
        std::fs::create_dir(root.path().join("nested")).unwrap();
        std::fs::write(root.path().join("nested/hidden"), "").unwrap();
        let scans = DirectoryScans::default();
        let mut names = Vec::new();
        loop {
            let page = scans.read(root.path().to_str().unwrap(), "one").unwrap();
            assert!(page.entries.len() <= 256);
            names.extend(page.entries.into_iter().map(|entry| entry.name));
            if page.done { break }
        }
        assert_eq!(names.len(), 514);
        assert!(!names.iter().any(|name| name.contains('/')));
        assert!(scans.0.lock().unwrap().is_empty());
        scans.read(root.path().to_str().unwrap(), "cancelled").unwrap();
        scans.0.lock().unwrap().remove("cancelled");
        assert!(scans.0.lock().unwrap().is_empty());
    }
}
