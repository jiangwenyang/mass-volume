mod server;
mod state;

use std::path::PathBuf;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// 在独立线程启动局域网服务，避免堵住 Tauri 自己的异步运行时。
///
/// # 参数
/// - `data_path` - 房间状态文件的绝对路径
///
/// # 返回值
/// 实际监听的端口。绑定失败时返回错误说明。
fn start_server(data_path: PathBuf) -> Result<u16, String> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let runtime = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(runtime) => runtime,
            Err(error) => {
                let _ = tx.send(Err(error.to_string()));
                return;
            }
        };
        runtime.block_on(server::serve(data_path, tx));
    });
    rx.recv().map_err(|error| error.to_string())?
}

/// 启动桌面窗口。服务随进程拉起，窗口关闭后进程退出，端口一并释放。
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let port = start_server(dir.join("state.json")).map_err(std::io::Error::other)?;

            let url = if cfg!(debug_assertions) {
                "http://localhost:5174".to_string()
            } else {
                format!("http://127.0.0.1:{port}/")
            };
            let parsed = url.parse().map_err(std::io::Error::other)?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title("探究物质的质量与体积的关系")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                .maximized(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动客户端失败");
}
