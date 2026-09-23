use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager, State};

pub const EXTERNAL_OPEN_EVENT: &str = "external-open-requested";

#[derive(Default)]
pub struct ExternalOpenState {
    pending_paths: Mutex<Vec<String>>,
}

impl ExternalOpenState {
    pub fn from_current_process() -> Self {
        let cwd = std::env::current_dir().unwrap_or_default();
        let paths = collect_supported_paths(std::env::args_os().skip(1), &cwd);
        Self {
            pending_paths: Mutex::new(paths),
        }
    }
}

#[tauri::command]
pub fn take_external_open_requests(state: State<'_, ExternalOpenState>) -> Vec<String> {
    std::mem::take(&mut *state.pending_paths.lock().unwrap())
}

pub fn enqueue_arguments(app: &AppHandle, args: Vec<String>, cwd: String) {
    let paths = collect_supported_paths(args, Path::new(&cwd));
    enqueue_paths(app, paths);
}

pub fn enqueue_paths(app: &AppHandle, paths: Vec<String>) {
    let paths = paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| is_supported_path(path))
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .collect::<Vec<_>>();
    if paths.is_empty() {
        return;
    }

    app.state::<ExternalOpenState>()
        .pending_paths
        .lock()
        .unwrap()
        .extend(paths);
    let _ = app.emit(EXTERNAL_OPEN_EVENT, ());

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn collect_supported_paths<I, S>(arguments: I, cwd: &Path) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    arguments
        .into_iter()
        .map(|argument| PathBuf::from(argument.as_ref()))
        .filter(|path| is_supported_path(path))
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        })
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .collect()
}

fn is_supported_path(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let comparable = normalized.to_ascii_lowercase();
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
    let internal_json_names = ["project.json", "fonts.json", "icons.json", "locale.json", "manifest.json"];
    if internal_json_names.iter().any(|name| file_name.eq_ignore_ascii_case(name))
        && comparable.contains("/.opencard/") {
        return true;
    }

    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            ["ocdocument", "ocblock", "ocpack", "octemplate", "ociconpack"]
                .iter()
                .any(|supported| extension.eq_ignore_ascii_case(supported))
        })
}

#[cfg(test)]
mod tests {
    use super::collect_supported_paths;
    use std::path::Path;

    #[test]
    fn collects_registered_file_types_and_resolves_relative_paths() {
        let paths = collect_supported_paths(
            [
                "cards/main.ocdocument",
                "blocks/square.ocblock",
                "template.octemplate",
                "icons.ociconpack",
                "packages/theme.ocpack",
                "notes.txt",
            ],
            Path::new("D:/Project"),
        );

        assert_eq!(
            paths,
            [
                "D:/Project/cards/main.ocdocument",
                "D:/Project/blocks/square.ocblock",
                "D:/Project/template.octemplate",
                "D:/Project/icons.ociconpack",
                "D:/Project/packages/theme.ocpack",
            ]
        );
    }
}
