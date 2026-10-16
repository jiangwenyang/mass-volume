//! 局域网 HTTP 与 WebSocket。教师窗口和学生平板都连这里。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{StatusCode, Uri};
#[cfg(not(debug_assertions))]
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

use crate::state::{RoomState, StateError};

#[cfg(not(debug_assertions))]
use include_dir::{include_dir, Dir};

#[cfg(not(debug_assertions))]
static DIST: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/../dist");

/// 进程内共享的房间与广播通道。
#[derive(Clone)]
struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    room: Mutex<RoomState>,
    path: PathBuf,
    tx: broadcast::Sender<String>,
    /// 每个连接的身份和选中的组，教师窗口也在这里。
    seats: Mutex<HashMap<u64, Seat>>,
    next_seat: AtomicU64,
    port: u16,
}

/// 一个连接的身份。教师窗口从不发选组消息，`tablet` 一直为假。
#[derive(Default)]
struct Seat {
    /// 发过选组消息，说明是学生平板
    tablet: bool,
    /// 当前选中的组，停在选组页时为空
    group_id: Option<String>,
}

/// 调整分组的请求体。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetGroupsBody {
    count: usize,
    #[serde(default)]
    force: bool,
    names: Option<Vec<String>>,
}

/// 学生或教师发来的实时指令。
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    #[serde(rename = "patch")]
    Patch {
        #[serde(rename = "groupId")]
        group_id: String,
        row: usize,
        field: String,
        value: Option<f64>,
    },
    #[serde(rename = "row-add")]
    RowAdd {
        #[serde(rename = "groupId")]
        group_id: String,
    },
    #[serde(rename = "row-remove")]
    RowRemove {
        #[serde(rename = "groupId")]
        group_id: String,
        row: usize,
    },
    #[serde(rename = "set-groups")]
    SetGroups {
        count: usize,
        #[serde(default)]
        force: bool,
        names: Option<Vec<String>>,
    },
    #[serde(rename = "reset")]
    Reset,
    #[serde(rename = "sample")]
    Sample,
}

/// 绑定端口并一直提供页面和实时接口。成功监听后立刻通过 `ready` 交还端口。
///
/// # 参数
/// - `data_path` - 状态文件
/// - `ready` - 用来把端口或启动错误交回主线程
pub async fn serve(data_path: PathBuf, ready: std::sync::mpsc::SyncSender<Result<u16, String>>) {
    let bound = bind_listener().await;
    let (listener, port) = match bound {
        Ok(value) => value,
        Err(error) => {
            let _ = ready.send(Err(error));
            return;
        }
    };
    write_debug_port(port);
    let room = RoomState::load(&data_path);
    let (tx, _) = broadcast::channel(256);
    let app_state = AppState {
        inner: Arc::new(Inner {
            room: Mutex::new(room),
            path: data_path,
            tx,
            seats: Mutex::new(HashMap::new()),
            next_seat: AtomicU64::new(1),
            port,
        }),
    };
    let app = Router::new()
        .route("/api/state", get(get_state))
        .route("/api/info", get(get_info))
        .route("/api/groups", post(post_groups))
        .route("/api/reset", post(post_reset))
        .route("/api/sample", post(post_sample))
        .route("/ws", get(ws_upgrade))
        .fallback(fallback)
        .with_state(app_state);
    print_urls(port);
    let _ = ready.send(Ok(port));
    if let Err(error) = axum::serve(listener, app).await {
        eprintln!("服务中断: {error}");
    }
}

/// 从 3780 起尝试监听，最多顺延 10 个端口。
async fn bind_listener() -> Result<(TcpListener, u16), String> {
    for port in 3780..3790 {
        if let Ok(listener) = TcpListener::bind(("0.0.0.0", port)).await {
            return Ok((listener, port));
        }
    }
    Err("3780 到 3789 端口都被占用，服务没有启动".into())
}

/// 开发时把端口写到项目根目录，供 Vite 代理读取。
fn write_debug_port(port: u16) {
    #[cfg(debug_assertions)]
    {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.server-port");
        let _ = std::fs::write(path, port.to_string());
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = port;
    }
}

/// 在终端打出平板可以打开的地址。
fn print_urls(port: u16) {
    println!("实验服务已监听 0.0.0.0:{port}");
    let ips = lan_ips();
    if ips.is_empty() && std::env::var_os("PUBLIC_HOST").is_some() {
        println!("没有设置 PUBLIC_HOST，二维码使用老师打开教师页时的地址，学生页在 /s");
        return;
    }
    if ips.is_empty() {
        println!("没有发现局域网地址。学生页: http://127.0.0.1:{port}/s");
        return;
    }
    for ip in ips {
        println!("学生页: http://{ip}:{port}/s");
    }
}

/// 列出学生可以访问的地址。设置了 `PUBLIC_HOST` 时只用它（逗号分隔，可以为空），
/// 否则列出本机非回环的 IPv4 地址。容器里探测到的是容器内网地址，平板连不上。
fn lan_ips() -> Vec<String> {
    if let Ok(value) = std::env::var("PUBLIC_HOST") {
        return value
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect();
    }
    let mut ips = Vec::new();
    let Ok(ifaces) = if_addrs::get_if_addrs() else {
        return ips;
    };
    for iface in ifaces {
        let if_addrs::IfAddr::V4(addr) = iface.addr else {
            continue;
        };
        let ip = addr.ip;
        if ip.is_loopback() || ip.is_link_local() {
            continue;
        }
        let text = ip.to_string();
        if !ips.contains(&text) {
            ips.push(text);
        }
    }
    ips
}

/// 返回当前房间。
async fn get_state(State(app): State<AppState>) -> Json<RoomState> {
    Json(app.snapshot())
}

/// 返回端口和局域网地址，供二维码使用。
async fn get_info(State(app): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "port": app.inner.port,
        "ips": lan_ips(),
    }))
}

/// 设置组数和组名。
async fn post_groups(
    State(app): State<AppState>,
    Json(body): Json<SetGroupsBody>,
) -> Result<Json<RoomState>, Response> {
    app.mutate(|room| room.set_groups(body.count, body.force, body.names))
        .map(Json)
        .map_err(error_response)
}

/// 清空单元格。
async fn post_reset(State(app): State<AppState>) -> Json<RoomState> {
    Json(app.mutate(|room| {
        room.reset();
        Ok(())
    }).expect("清空不会失败"))
}

/// 载入示例数据。
async fn post_sample(State(app): State<AppState>) -> Json<RoomState> {
    Json(app.mutate(|room| {
        room.load_sample();
        Ok(())
    }).expect("示例数据不会失败"))
}

/// 升级为 WebSocket。
async fn ws_upgrade(ws: WebSocketUpgrade, State(app): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, app))
}

/// 开发模式只提供接口；发布包同时提供前端页面。
async fn fallback(uri: Uri) -> Response {
    #[cfg(debug_assertions)]
    let response = (
        StatusCode::NOT_FOUND,
        format!("开发模式请打开 Vite 页面，而不是直接访问 {}", uri.path()),
    )
        .into_response();
    #[cfg(not(debug_assertions))]
    let response = serve_asset(uri);
    response
}

/// 从打包进来的 dist 里取文件，找不到时回退到首页，交给前端路由。
#[cfg(not(debug_assertions))]
fn serve_asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let requested = if path.is_empty() { "index.html" } else { path };
    let file = DIST.get_file(requested).or_else(|| DIST.get_file("index.html"));
    let Some(file) = file else {
        return (StatusCode::NOT_FOUND, "页面还没有打包").into_response();
    };
    let mime = mime_of(file.path().to_str().unwrap_or(requested));
    (
        [(header::CONTENT_TYPE, mime)],
        file.contents().to_vec(),
    )
        .into_response()
}

/// 按扩展名给出内容类型。
#[cfg(not(debug_assertions))]
fn mime_of(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") {
        "text/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".json") {
        "application/json"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

/// 一条入站消息是在登记所在组，还是普通数据指令。
enum Incoming {
    Seat(Option<String>),
    Other,
}

/**
 * 识别平板发来的选组消息。
 */
fn classify(text: &str) -> Incoming {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
        return Incoming::Other;
    };
    if value.get("type").and_then(|item| item.as_str()) != Some("seat") {
        return Incoming::Other;
    }
    let group_id = value
        .get("groupId")
        .and_then(|item| item.as_str())
        .filter(|item| !item.is_empty())
        .map(str::to_string);
    Incoming::Seat(group_id)
}

/// 一个平板或教师窗口的连接。断开时从已加入名单里拿掉。
async fn handle_socket(socket: WebSocket, app: AppState) {
    let seat = app.open_seat();
    let (mut sender, mut receiver) = socket.split();
    let mut rx = app.inner.tx.subscribe();
    let hello = app.state_message();
    if sender.send(Message::Text(hello.into())).await.is_err() {
        app.close_seat(seat);
        return;
    }
    app.publish_presence();
    loop {
        tokio::select! {
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        match classify(&text) {
                            Incoming::Seat(group_id) => app.sit(seat, group_id),
                            Incoming::Other => {
                                if let Some(error) = app.handle_text(&text) {
                                    if sender.send(Message::Text(error.into())).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            outgoing = rx.recv() => {
                match outgoing {
                    Ok(text) => {
                        if sender.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
    app.close_seat(seat);
}

impl AppState {
    /// 复制当前房间。
    fn snapshot(&self) -> RoomState {
        self.lock().clone()
    }

    /// 修改房间，成功后落盘并广播。
    fn mutate<T>(
        &self,
        change: impl FnOnce(&mut RoomState) -> Result<T, StateError>,
    ) -> Result<RoomState, StateError> {
        let mut room = self.lock();
        change(&mut room)?;
        room.touch();
        room.save(&self.inner.path);
        let snapshot = room.clone();
        let message = json!({ "type": "state", "state": snapshot }).to_string();
        drop(room);
        let _ = self.inner.tx.send(message);
        Ok(snapshot)
    }

    /// 执行一条实时指令。出错时返回只发给这一端的消息。
    fn handle_text(&self, text: &str) -> Option<String> {
        let message: ClientMessage = match serde_json::from_str(text) {
            Ok(message) => message,
            Err(_) => {
                return Some(error_json(&StateError::Invalid("无法识别的指令".into())));
            }
        };
        let result = match message {
            ClientMessage::Patch {
                group_id,
                row,
                field,
                value,
            } => self.mutate(|room| room.patch(&group_id, row, &field, value)),
            ClientMessage::RowAdd { group_id } => self.mutate(|room| room.add_row(&group_id)),
            ClientMessage::RowRemove { group_id, row } => {
                self.mutate(|room| room.remove_row(&group_id, row))
            }
            ClientMessage::SetGroups {
                count,
                force,
                names,
            } => self.mutate(|room| room.set_groups(count, force, names)),
            ClientMessage::Reset => self.mutate(|room| {
                room.reset();
                Ok(())
            }),
            ClientMessage::Sample => self.mutate(|room| {
                room.load_sample();
                Ok(())
            }),
        };
        result.err().map(|error| error_json(&error))
    }

    /// 全量状态消息。
    fn state_message(&self) -> String {
        json!({ "type": "state", "state": self.snapshot() }).to_string()
    }

    /// 登记一个新连接，此时还没有选组。
    fn open_seat(&self) -> u64 {
        let id = self.inner.next_seat.fetch_add(1, Ordering::SeqCst);
        self.seats().insert(id, Seat::default());
        id
    }

    /// 平板选中或离开某一组。
    fn sit(&self, seat: u64, group_id: Option<String>) {
        {
            let mut seats = self.seats();
            if let Some(slot) = seats.get_mut(&seat) {
                slot.tablet = true;
                slot.group_id = group_id;
            }
        }
        self.publish_presence();
    }

    /// 连接结束，从已加入名单移除。
    fn close_seat(&self, seat: u64) {
        self.seats().remove(&seat);
        self.publish_presence();
    }

    /// 广播在线平板数，以及每个组当前有几台平板。教师窗口不计入。
    fn publish_presence(&self) {
        let valid: std::collections::HashSet<String> = self
            .snapshot()
            .groups
            .into_iter()
            .map(|group| group.id)
            .collect();
        let (clients, counts) = tally(&self.seats(), &valid);
        let joined: Vec<_> = counts
            .into_iter()
            .map(|(group_id, count)| json!({ "groupId": group_id, "count": count }))
            .collect::<Vec<_>>();
        let message = json!({
            "type": "presence",
            "clients": clients,
            "joined": joined,
        })
        .to_string();
        let _ = self.inner.tx.send(message);
    }

    /// 取得座位表。锁中毒时继续用里面的数据。
    fn seats(&self) -> std::sync::MutexGuard<'_, HashMap<u64, Seat>> {
        self.inner
            .seats
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }

    /// 取得房间锁。锁中毒时继续用里面的数据。
    fn lock(&self) -> std::sync::MutexGuard<'_, RoomState> {
        self.inner.room.lock().unwrap_or_else(|error| error.into_inner())
    }
}

/// 数出在线平板数，以及每个现存组里有几台平板。
///
/// # 参数
/// - `seats` - 全部连接
/// - `valid` - 当前还存在的组 id
fn tally(
    seats: &HashMap<u64, Seat>,
    valid: &std::collections::HashSet<String>,
) -> (usize, HashMap<String, usize>) {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for group_id in seats.values().filter_map(|seat| seat.group_id.as_ref()) {
        if valid.contains(group_id) {
            *counts.entry(group_id.clone()).or_default() += 1;
        }
    }
    let tablets = seats.values().filter(|seat| seat.tablet).count();
    (tablets, counts)
}

/// HTTP 错误。
fn error_response(error: StateError) -> Response {
    let status = match error {
        StateError::NeedsConfirm(_) => StatusCode::CONFLICT,
        StateError::Invalid(_) => StatusCode::BAD_REQUEST,
    };
    let body = error_body(&error);
    (status, Json(body)).into_response()
}

/// WebSocket 错误消息。
fn error_json(error: &StateError) -> String {
    let mut body = error_body(error);
    if let Some(object) = body.as_object_mut() {
        object.insert("type".into(), json!("error"));
    }
    body.to_string()
}

/// 错误的公共字段。
fn error_body(error: &StateError) -> serde_json::Value {
    match error {
        StateError::NeedsConfirm(message) => json!({
            "code": "needs-confirm",
            "message": message,
        }),
        StateError::Invalid(message) => json!({
            "code": "invalid",
            "message": message,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn teacher_windows_are_not_counted_as_tablets() {
        let mut seats = HashMap::new();
        seats.insert(1, Seat::default());
        seats.insert(2, Seat::default());
        seats.insert(3, Seat { tablet: true, group_id: None });
        seats.insert(4, Seat { tablet: true, group_id: Some("g2".into()) });
        let valid = ["g1".to_string(), "g2".to_string()].into_iter().collect();
        let (tablets, counts) = tally(&seats, &valid);
        assert_eq!(tablets, 2);
        assert_eq!(counts.get("g2"), Some(&1));
        assert_eq!(counts.get("g1"), None);
    }

    #[test]
    fn removed_groups_drop_out_of_joined() {
        let mut seats = HashMap::new();
        seats.insert(1, Seat { tablet: true, group_id: Some("g9".into()) });
        let valid = ["g1".to_string()].into_iter().collect();
        let (tablets, counts) = tally(&seats, &valid);
        assert_eq!(tablets, 1);
        assert!(counts.is_empty());
    }
}
