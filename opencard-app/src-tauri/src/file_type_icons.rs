//! Windows 文件类型图标注册。
//!
//! 安装器给 OpenCard 各扩展名写下的 `DefaultIcon` 都指向应用本体（NSIS）或者根本没有写（MSI），
//! 而 Tauri 的 `fileAssociations` 没有按扩展名指定图标的字段，所以 `.ocblock` 和 `.ocpack` 的专用图标必须在
//! 安装器里补写、或者在应用启动时按当前用户补写。两条路写的是同一个值：这里只写 HKCU，
//! 既不需要管理员权限，也能盖住两种安装器写下的机器级关联。
//!
//! 值已经正确、图标文件也没换过时不做任何写入。只换图标文件（路径不变）时外壳会继续用缓存里的
//! 旧图，所以这里另外记一份图标文件的指纹，指纹变了就通知外壳刷新。

/// 把 `.ocpack` 的图标指向随应用分发的图标文件。
pub fn register_resource_package_icon(icon_path: &std::path::Path) -> Result<bool, String> {
    platform::register(icon_path, ".ocpack", "resourcePackage")
}

/// 把 `.ocblock` 的图标指向随应用分发的图标文件。
pub fn register_custom_block_icon(icon_path: &std::path::Path) -> Result<bool, String> {
    platform::register(icon_path, ".ocblock", "customBlock")
}

#[cfg(target_os = "windows")]
mod platform {
    use std::path::Path;
    use windows_sys::Win32::Foundation::{ERROR_SUCCESS, WIN32_ERROR};
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyW, RegGetValueW, RegOpenKeyExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ, RRF_RT_REG_SZ,
    };
    use windows_sys::Win32::UI::Shell::{
        SHChangeNotify, SHCNE_ASSOCCHANGED, SHCNF_FLUSH, SHCNF_IDLIST,
    };

    /// 记录图标文件指纹的位置：外壳按路径缓存图标，只换文件不会让它重新取图。
    const STAMP_KEY: &str = r"Software\OpenCard\FileTypeIcons";

    pub fn register(icon_path: &Path, extension: &str, stamp_value: &str) -> Result<bool, String> {
        let value = format!("\"{}\",0", icon_path.display());
        let mut changed = false;
        for key in icon_keys(extension) {
            changed |= set_string(&key, None, &value)?;
        }
        let stamp = icon_stamp(icon_path)?;
        if read_string(HKEY_CURRENT_USER, STAMP_KEY, Some(stamp_value)).as_deref() != Some(&stamp) {
            set_string(STAMP_KEY, Some(stamp_value), &stamp)?;
            changed = true;
        }
        if changed {
            notify_shell();
        }
        Ok(changed)
    }

    /// 图标文件的指纹：路径不变、内容换掉时唯一能看出差别的东西。
    fn icon_stamp(icon_path: &Path) -> Result<String, String> {
        let metadata = std::fs::metadata(icon_path)
            .map_err(|error| format!("read {}: {error}", icon_path.display()))?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |elapsed| elapsed.as_nanos());
        Ok(format!("{}:{modified}", metadata.len()))
    }

    /// `SHCNF_FLUSH` 让刷新立刻生效：外壳的图标缓存不刷的话，新图要等图标缓存重建才出现。
    fn notify_shell() {
        unsafe {
            SHChangeNotify(
                SHCNE_ASSOCCHANGED as i32,
                SHCNF_IDLIST | SHCNF_FLUSH,
                std::ptr::null(),
                std::ptr::null(),
            );
        }
    }

    /// 需要写入的 `DefaultIcon` 键：扩展名自身兜底，再加上当前关联类——安装器各自用的是不同的类名
    /// （NSIS 用关联的 name，MSI 用 `product_name.ext`），所以从注册表读当时真正的那一个。
    fn icon_keys(extension: &str) -> Vec<String> {
        let extension_key = format!(r"Software\Classes\{extension}");
        let mut keys = vec![format!(r"{extension_key}\DefaultIcon")];
        let prog_id = read_string(HKEY_CURRENT_USER, &extension_key, None)
            .or_else(|| read_string(HKEY_LOCAL_MACHINE, &extension_key, None));
        let Some(prog_id) = prog_id.filter(|value| !value.is_empty()) else {
            return keys;
        };
        let class_key = format!(r"Software\Classes\{prog_id}");
        if key_exists(HKEY_CURRENT_USER, &class_key) || key_exists(HKEY_LOCAL_MACHINE, &class_key) {
            keys.push(format!(r"{class_key}\DefaultIcon"));
        }
        keys
    }

    /// 键存在与否要和"默认值存在与否"分开：MSI 写下的关联类可能没有默认值。
    fn key_exists(hive: HKEY, subkey: &str) -> bool {
        let subkey_wide = wide(subkey);
        let mut handle: HKEY = std::ptr::null_mut();
        let status = unsafe { RegOpenKeyExW(hive, subkey_wide.as_ptr(), 0, KEY_READ, &mut handle) };
        if status != ERROR_SUCCESS {
            return false;
        }
        unsafe { RegCloseKey(handle) };
        true
    }

    /// 写入一个字符串值；`value_name` 为 `None` 时写默认值。返回是否真的改动了它。
    fn set_string(subkey: &str, value_name: Option<&str>, value: &str) -> Result<bool, String> {
        let subkey_wide = wide(subkey);
        let mut handle: HKEY = std::ptr::null_mut();
        unsafe {
            // `RegCreateKeyW` 就是"存在则打开、不存在则创建"，而且不需要 `Win32_Security` 的绑定。
            check(
                RegCreateKeyW(HKEY_CURRENT_USER, subkey_wide.as_ptr(), &mut handle),
                &format!("open {subkey}"),
            )?;
        }
        let current = read_string(HKEY_CURRENT_USER, subkey, value_name);
        let changed = current.as_deref() != Some(value);
        let result = if changed {
            let value_name_wide = value_name.map(wide);
            let data = wide(value);
            let bytes = unsafe {
                std::slice::from_raw_parts(data.as_ptr().cast::<u8>(), data.len() * 2)
            };
            unsafe {
                check(
                    RegSetValueExW(
                        handle,
                        value_name_wide
                            .as_ref()
                            .map_or(std::ptr::null(), |name| name.as_ptr()),
                        0,
                        REG_SZ,
                        bytes.as_ptr(),
                        bytes.len() as u32,
                    ),
                    &format!("write {subkey}"),
                )
            }
        } else {
            Ok(())
        };
        unsafe { RegCloseKey(handle) };
        result.map(|()| changed)
    }

    fn read_string(hive: HKEY, subkey: &str, value_name: Option<&str>) -> Option<String> {
        let subkey_wide = wide(subkey);
        let value_wide = value_name.map(wide);
        let mut buffer = vec![0u16; 1024];
        let mut size = (buffer.len() * 2) as u32;
        let status = unsafe {
            RegGetValueW(
                hive,
                subkey_wide.as_ptr(),
                value_wide.as_ref().map_or(std::ptr::null(), |name| name.as_ptr()),
                RRF_RT_REG_SZ,
                std::ptr::null_mut(),
                buffer.as_mut_ptr().cast::<std::ffi::c_void>(),
                &mut size,
            )
        };
        if status != ERROR_SUCCESS {
            return None;
        }
        let length = buffer.iter().position(|unit| *unit == 0).unwrap_or(buffer.len());
        Some(String::from_utf16_lossy(&buffer[..length]))
    }

    fn check(status: WIN32_ERROR, action: &str) -> Result<(), String> {
        if status == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(format!("{action}: registry error {status}"))
        }
    }

    /// 注册表 API 只接受以 NUL 结尾的 UTF-16。
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn register(_icon_path: &std::path::Path, _extension: &str, _stamp_value: &str) -> Result<bool, String> {
        Ok(false)
    }
}
