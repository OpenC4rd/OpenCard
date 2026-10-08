use std::path::{Path, PathBuf};

fn profile_output_directory() -> Option<PathBuf> {
    let out_dir = PathBuf::from(std::env::var_os("OUT_DIR")?);
    let profile = out_dir.ancestors().nth(3)?;
    let profile_name = profile.file_name()?.to_str()?;
    if profile_name != "debug" && profile_name != "release" {
        return None;
    }
    let target = profile.parent()?;
    if target.file_name()?.to_str()? != "target" {
        return None;
    }
    Some(profile.to_path_buf())
}

fn remove_staged_resource_directory(profile: &Path, name: &str) {
    let path = profile.join(name);
    if path.is_dir() {
        std::fs::remove_dir_all(&path).unwrap_or_else(|error| {
            panic!(
                "failed to clear staged resource '{}': {error}",
                path.display()
            )
        });
    }
}

fn main() {
    println!("cargo:rerun-if-changed=resources/templates");
    if let Some(profile) = profile_output_directory() {
        remove_staged_resource_directory(&profile, "templates");
    }
    tauri_build::build()
}
