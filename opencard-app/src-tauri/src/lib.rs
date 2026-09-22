use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{Emitter, State};

#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

mod external_open;
mod file_type_icons;
mod git_service;
mod network_resource;
mod resource_package;
mod resource_package_builder;

/// 文件变化合并窗口：这段时间内的变化合成一次通知，避免一次提交/装包产生成百上千次前端回调。
const FILE_CHANGE_BATCH_MS: u64 = 120;
/// 一批最多带多少条路径，超过就先发出去。
const FILE_CHANGE_BATCH_MAX: usize = 256;

/*
 * 递归监听项目根会把版本库内部与被管理的包存储也报上来，而这些变化界面不关心：
 * 版本控制自己读仓库，包安装流程自己收尾重载。放它们过去只会让前端白跑扫描。
 */
fn is_ignored_change(path: &str) -> bool {
    let normalized = path.replace('\\', "/").to_lowercase();
    normalized.ends_with("/.git")
        || normalized.contains("/.git/")
        || normalized.ends_with("/.opencard/packages")
        || normalized.contains("/.opencard/packages/")
}

// 存储 watcher 的全局状态
struct WatcherState {
    watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn list_system_font_families() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut database = fontdb::Database::new();
        database.load_system_fonts();
        database
            .faces()
            .flat_map(|face| face.families.iter().map(|(name, _language)| name.trim()))
            .filter(|name| !name.is_empty() && !name.starts_with('@'))
            .map(str::to_owned)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    })
    .await
    .map_err(|error| format!("Failed to enumerate system fonts: {error}"))
}

/// 系统已安装字体的一个字面：前端用它把系统字体归类到项目字体槽位并复制进项目。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemFontFace {
    family: String,
    face_name: String,
    path: String,
    index: u32,
    weight: u16,
    italic: bool,
}

#[tauri::command]
async fn list_system_fonts() -> Result<Vec<SystemFontFace>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut database = fontdb::Database::new();
        database.load_system_fonts();
        database
            .faces()
            .filter_map(|face| {
                let path = match &face.source {
                    fontdb::Source::File(path) => path.to_string_lossy().into_owned(),
                    _ => return None,
                };
                let family = face
                    .families
                    .iter()
                    .map(|(name, _language)| name.trim())
                    .find(|name| !name.is_empty() && !name.starts_with('@'))?;
                Some(SystemFontFace {
                    family: family.to_owned(),
                    face_name: face.post_script_name.clone(),
                    path,
                    index: face.index,
                    weight: face.weight.0,
                    italic: !matches!(face.style, fontdb::Style::Normal),
                })
            })
            .collect()
    })
    .await
    .map_err(|error| format!("Failed to enumerate system fonts: {error}"))
}

#[tauri::command]
fn watch_directory(
    path: String,
    app_handle: tauri::AppHandle,
    state: State<WatcherState>,
) -> Result<String, String> {
    // 停止之前的监听
    let mut watcher_lock = state.watcher.lock().unwrap();
    *watcher_lock = None;

    // 创建新的 watcher
    let (tx, rx) = std::sync::mpsc::channel::<Result<Event, notify::Error>>();

    let mut watcher =
        notify::recommended_watcher(tx).map_err(|e| format!("创建监听器失败: {}", e))?;

    watcher
        .watch(std::path::Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| format!("监听目录失败: {}", e))?;

    // 在新线程中处理文件变化事件：过滤掉界面不关心的路径，并把爆发合并成一批。
    // 递归监听项目根意味着一次提交、一次装包都会产生成百上千个事件；逐个转发会让前端
    // 为每个事件跑一遍扫描，主线程被占住数秒（实测打开项目卡 5 秒）。
    let app_handle_clone = app_handle.clone();
    std::thread::spawn(move || {
        let mut pending: Vec<String> = Vec::new();
        let mut last_emit = std::time::Instant::now();
        let emit = |pending: &mut Vec<String>| {
            if pending.is_empty() {
                return;
            }
            let paths = std::mem::take(pending);
            let payload = serde_json::json!({ "paths": paths });
            if let Err(e) = app_handle_clone.emit("file-changed", payload) {
                eprintln!("发送事件失败: {}", e);
            }
        };
        loop {
            match rx.recv_timeout(std::time::Duration::from_millis(FILE_CHANGE_BATCH_MS)) {
                Ok(Ok(event)) => match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        for path in &event.paths {
                            let path = path.to_string_lossy().to_string();
                            if is_ignored_change(&path) {
                                continue;
                            }
                            if !pending.iter().any(|existing| existing == &path) {
                                pending.push(path);
                            }
                        }
                    }
                    _ => {}
                },
                Ok(Err(e)) => eprintln!("监听错误: {}", e),
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    emit(&mut pending);
                    last_emit = std::time::Instant::now();
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    emit(&mut pending);
                    break;
                }
            }
            if pending.len() >= FILE_CHANGE_BATCH_MAX
                || (!pending.is_empty()
                    && last_emit.elapsed() >= std::time::Duration::from_millis(FILE_CHANGE_BATCH_MS))
            {
                emit(&mut pending);
                last_emit = std::time::Instant::now();
            }
        }
    });

    // 保存 watcher（防止被 drop）
    *watcher_lock = Some(watcher);

    Ok(format!("开始监听: {}", path))
}

#[tauri::command]
fn stop_watching(state: State<WatcherState>) -> Result<String, String> {
    let mut watcher_lock = state.watcher.lock().unwrap();
    *watcher_lock = None;
    Ok("停止监听".to_string())
}

#[tauri::command]
fn trash_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    std::fs::symlink_metadata(target)
        .map_err(|error| format!("Cannot trash '{}': {}", path, error))?;
    trash::delete(target).map_err(|error| format!("Failed to move '{}' to trash: {}", path, error))
}

#[cfg(target_os = "windows")]
fn create_windows_reveal_command(target: &Path, is_directory: bool) -> Command {
    let mut command = Command::new("explorer.exe");
    let windows_path = target.to_string_lossy().replace('/', "\\");
    if is_directory {
        command.arg(windows_path);
    } else {
        // explorer.exe parses its own command line: when the whole `/select,<path>` argument
        // arrives wrapped in quotes, it drops the switch and opens the default folder instead.
        // Only the path may be quoted, so the argument is appended verbatim.
        command.raw_arg(format!("/select,\"{}\"", windows_path));
    }
    command
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    let metadata = std::fs::symlink_metadata(target)
        .map_err(|error| format!("Cannot reveal '{}': {}", path, error))?;

    #[cfg(target_os = "windows")]
    let mut command = create_windows_reveal_command(target, metadata.is_dir());

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg("-R").arg(target);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let directory = if metadata.is_dir() {
            target
        } else {
            target
                .parent()
                .ok_or_else(|| format!("Cannot resolve parent directory for '{}'", path))?
        };
        let mut command = Command::new("xdg-open");
        command.arg(directory);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to reveal '{}': {}", path, error))
}

#[cfg(target_os = "windows")]
fn open_with_default_app(target: &Path) -> Result<(), String> {
    let operation = std::ffi::OsStr::new("open")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target_path = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            target_path.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize <= 32 {
        return Err(format!(
            "ShellExecuteW failed with code {}",
            result as isize
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_with_default_app(target: &Path) -> Result<(), String> {
    Command::new("open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "linux")]
fn open_with_default_app(target: &Path) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(target)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    std::fs::symlink_metadata(target)
        .map_err(|error| format!("Cannot open '{}': {}", path, error))?;

    open_with_default_app(target).map_err(|error| format!("Failed to open '{}': {}", path, error))
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn explorer_select_switch_stays_outside_the_quoted_path() {
        let target = Path::new("D:/My Cards/main.ocdocument");
        let command = create_windows_reveal_command(target, false);

        // explorer.exe keeps `/select,` working only while the quotes wrap the path alone.
        let arguments: Vec<_> = command.get_args().collect();
        assert_eq!(arguments, [r#"/select,"D:\My Cards\main.ocdocument""#]);

        // Guard the exact process command line: a fully quoted argument loses the switch and
        // makes explorer open its default folder instead of the requested file.
        let command_line = format!("{:?}", command);
        assert!(
            command_line.ends_with(r#"/select,"D:\My Cards\main.ocdocument""#),
            "unexpected command line: {command_line}"
        );
    }
}

/// `.ocpack` 图标文件的路径：安装后取资源目录，开发构建回退到源码树，
/// 因为 dev 不会把 resources 复制到目标目录。
fn resource_package_icon_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;

    let installed = app
        .path()
        .resource_dir()
        .ok()
        .map(|directory| directory.join("icons").join("ocpack.ico"))
        .filter(|path| path.is_file());
    installed.or_else(source_icon_path)
}

#[cfg(debug_assertions)]
fn source_icon_path() -> Option<PathBuf> {
    Some(Path::new(env!("CARGO_MANIFEST_DIR")).join("icons").join("ocpack.ico"))
}

#[cfg(not(debug_assertions))]
fn source_icon_path() -> Option<PathBuf> {
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder =
        tauri::Builder::default().manage(external_open::ExternalOpenState::from_current_process());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        external_open::enqueue_arguments(app, args, cwd);
    }));

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(WatcherState {
            watcher: Mutex::new(None),
        })
        .setup(|app| {
            // 文件类型图标是尽力而为的一步：注册失败只影响资源管理器里的图标，不应拦住启动。
            match resource_package_icon_path(app.handle()) {
                Some(path) => match file_type_icons::register_resource_package_icon(&path) {
                    Ok(true) => println!("Registered the resource package file icon: {}", path.display()),
                    Ok(false) => {}
                    Err(error) => eprintln!("Could not register the resource package file icon: {error}"),
                },
                None => eprintln!("The resource package icon asset is missing"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_system_font_families,
            list_system_fonts,
            watch_directory,
            stop_watching,
            trash_path,
            reveal_path,
            open_path,
            network_resource::download_network_resource,
            git_service::git_inspect,
            git_service::git_initialize,
            git_service::git_status,
            git_service::git_stage,
            git_service::git_stage_all,
            git_service::git_unstage,
            git_service::git_unstage_all,
            git_service::git_discard,
            git_service::git_commit,
            git_service::git_amend,
            git_service::git_history,
            git_service::git_commit_summary,
            git_service::git_diff,
            git_service::git_branches,
            git_service::git_create_branch,
            git_service::git_checkout,
            git_service::git_delete_branch,
            git_service::git_rename_branch,
            git_service::git_tags,
            git_service::git_create_tag,
            git_service::git_delete_tag,
            git_service::git_stashes,
            git_service::git_create_stash,
            git_service::git_apply_stash,
            git_service::git_drop_stash,
            git_service::git_reset,
            git_service::git_cherry_pick,
            git_service::git_revert,
            git_service::git_cleanup_state,
            git_service::git_remotes,
            git_service::git_add_remote,
            git_service::git_delete_remote,
            git_service::git_rename_remote,
            git_service::git_fetch,
            git_service::git_push,
            git_service::git_pull,
            git_service::git_clone,
            git_service::git_read_config,
            git_service::git_write_config,
            git_service::git_file_history,
            git_service::git_read_file_at_revision,
            git_service::git_materialize_revision,
            git_service::git_conflicts,
            git_service::git_merge,
            git_service::git_rebase_start,
            git_service::git_rebase_continue,
            git_service::git_abort_operation,
            external_open::take_external_open_requests,
            resource_package::recover_resource_package_transactions,
            resource_package::inspect_resource_package,
            resource_package::inspect_installed_resource_package,
            resource_package::install_resource_package,
            resource_package_builder::build_resource_package,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let paths = urls
                    .into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().replace('\\', "/"))
                    .collect();
                external_open::enqueue_paths(_app, paths);
            }
        });
}
