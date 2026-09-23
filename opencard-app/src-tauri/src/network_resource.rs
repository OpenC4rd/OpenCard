use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::ipc::Channel;
use tokio::io::AsyncWriteExt;

const MAX_RESOURCE_BYTES: u64 = 100 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_REDIRECTS: usize = 10;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResourceProgress {
    url: String,
    received_bytes: u64,
    total_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkResourceDownload {
    content_type: Option<String>,
    received_bytes: u64,
}

/// 下载只能落在调用方给的那个缓存根里。根由前端传入 —— 布局只有一个出口
/// （`src/shared/storage/appStoragePaths.ts`），这里不拼 `.opencard`。
fn validate_destination(cache_root: &str, destination: &Path) -> Result<(), String> {
    if destination.extension().and_then(|value| value.to_str()) != Some("download") {
        return Err("Network resources must download to a .download temporary file".to_string());
    }
    let root = PathBuf::from(cache_root)
        .canonicalize()
        .map_err(|error| format!("Could not access the OpenCard cache directory: {error}"))?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Network resource destination has no parent directory".to_string())?
        .canonicalize()
        .map_err(|error| format!("Could not access the cache destination directory: {error}"))?;
    if !parent.starts_with(&root) {
        return Err(
            "Network resource destination is outside the OpenCard cache directory".to_string(),
        );
    }
    Ok(())
}

fn redirect_target_allowed(source_host: &str, target: &reqwest::Url) -> bool {
    target.scheme() == "https" && target.host_str() == Some(source_host)
}

fn create_client(source_url: &reqwest::Url) -> Result<reqwest::Client, String> {
    let source_host = source_url
        .host_str()
        .ok_or_else(|| "Network resource URL has no host".to_string())?
        .to_owned();
    let redirect_policy = reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            return attempt.error("too many network resource redirects");
        }
        let next = attempt.url();
        if !redirect_target_allowed(&source_host, next) {
            return attempt
                .error("network resource redirects must remain HTTPS on the original host");
        }
        attempt.follow()
    });
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(redirect_policy)
        .build()
        .map_err(|error| format!("Could not create the network client: {error}"))
}

async fn remove_temporary_file(path: &Path) {
    let _ = tokio::fs::remove_file(path).await;
}

#[tauri::command]
pub async fn download_network_resource(
    url: String,
    destination_path: String,
    cache_root: String,
    on_progress: Channel<NetworkResourceProgress>,
) -> Result<NetworkResourceDownload, String> {
    let parsed_url = reqwest::Url::parse(&url)
        .map_err(|error| format!("Network resource URL is invalid: {error}"))?;
    if parsed_url.scheme() != "https" {
        return Err("Network resources must use HTTPS".to_string());
    }

    let destination = PathBuf::from(destination_path);
    validate_destination(&cache_root, &destination)?;
    remove_temporary_file(&destination).await;

    let response = create_client(&parsed_url)?
        .get(parsed_url)
        .send()
        .await
        .map_err(|error| format!("Network resource request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Network resource request returned HTTP {}",
            response.status()
        ));
    }
    let total_bytes = response.content_length();
    if total_bytes.is_some_and(|size| size > MAX_RESOURCE_BYTES) {
        return Err(format!(
            "Network resource exceeds the {} MiB limit",
            MAX_RESOURCE_BYTES / 1024 / 1024
        ));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&destination)
        .await
        .map_err(|error| {
            format!("Could not create the network resource temporary file: {error}")
        })?;
    let mut received_bytes = 0u64;
    let _ = on_progress.send(NetworkResourceProgress {
        url: url.clone(),
        received_bytes,
        total_bytes,
    });

    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) => {
                drop(file);
                remove_temporary_file(&destination).await;
                return Err(format!(
                    "Could not read the network resource response: {error}"
                ));
            }
        };
        received_bytes = received_bytes.saturating_add(chunk.len() as u64);
        if received_bytes > MAX_RESOURCE_BYTES {
            drop(file);
            remove_temporary_file(&destination).await;
            return Err(format!(
                "Network resource exceeds the {} MiB limit",
                MAX_RESOURCE_BYTES / 1024 / 1024
            ));
        }
        if let Err(error) = file.write_all(&chunk).await {
            drop(file);
            remove_temporary_file(&destination).await;
            return Err(format!(
                "Could not write the network resource temporary file: {error}"
            ));
        }
        let _ = on_progress.send(NetworkResourceProgress {
            url: url.clone(),
            received_bytes,
            total_bytes,
        });
    }

    if received_bytes == 0 {
        drop(file);
        remove_temporary_file(&destination).await;
        return Err("Network resource response is empty".to_string());
    }
    if let Err(error) = file.flush().await {
        drop(file);
        remove_temporary_file(&destination).await;
        return Err(format!(
            "Could not flush the network resource temporary file: {error}"
        ));
    }
    Ok(NetworkResourceDownload {
        content_type,
        received_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redirect_policy_rejects_cross_host_and_non_https_targets() {
        let source = reqwest::Url::parse("https://assets.example.com/image.png").unwrap();
        assert!(create_client(&source).is_ok());
        assert!(redirect_target_allowed(
            "assets.example.com",
            &reqwest::Url::parse("https://assets.example.com/next.png").unwrap()
        ));
        assert!(!redirect_target_allowed(
            "assets.example.com",
            &reqwest::Url::parse("http://assets.example.com/next.png").unwrap()
        ));
        assert!(!redirect_target_allowed(
            "assets.example.com",
            &reqwest::Url::parse("https://cdn.example.com/next.png").unwrap()
        ));
        assert_eq!(MAX_RESOURCE_BYTES, 104_857_600);
    }

    #[test]
    fn downloads_must_land_inside_the_given_cache_root() {
        let millis = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let root = std::env::temp_dir().join(format!("opencard-network-root-{millis}"));
        let inside = root.join("project-a");
        let outside = std::env::temp_dir().join(format!("opencard-network-outside-{millis}"));
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let root_text = root.to_string_lossy().to_string();

        assert!(validate_destination(&root_text, &inside.join("image.png.download")).is_ok());
        // 临时文件以外的名字不接受：下载不会就地覆盖缓存里的成品。
        assert!(validate_destination(&root_text, &inside.join("image.png")).is_err());
        // 根之外的落点不接受，哪怕只是同一个盘上的兄弟目录。
        assert!(validate_destination(&root_text, &outside.join("image.png.download")).is_err());

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&outside);
    }
}
