//! 网页部署版：不带桌面窗口，只跑和客户端同一套局域网服务。
//! 服务代码直接复用 `src-tauri/src`，两边始终一致。

#[path = "../../src-tauri/src/server.rs"]
mod server;
#[path = "../../src-tauri/src/state.rs"]
mod state;

use std::path::PathBuf;

/// 启动服务。状态文件放在 `DATA_DIR`（默认 `./data`）下的 `state.json`。
#[tokio::main]
async fn main() {
    let dir = std::env::var_os("DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"));
    if let Err(error) = std::fs::create_dir_all(&dir) {
        eprintln!("无法创建数据目录 {}: {error}", dir.display());
        std::process::exit(1);
    }
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let task = tokio::spawn(server::serve(dir.join("state.json"), tx));
    let ready = tokio::task::spawn_blocking(move || rx.recv()).await;
    match ready {
        Ok(Ok(Ok(_))) => {}
        Ok(Ok(Err(error))) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
        _ => {
            eprintln!("服务没有启动");
            std::process::exit(1);
        }
    }
    let _ = task.await;
}
