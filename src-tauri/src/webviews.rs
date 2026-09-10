//! 패널(webview) 생성·배치·파괴 브리지.
//! 비즈니스 로직은 프론트에 두고, 여기서는 창 안의 webview만 다룬다.

use serde::Deserialize;
use tauri::{
    webview::WebviewBuilder, AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl,
};

/// Google 로그인·Cloudflare 통과율을 높이기 위해 Safari 최신 UA로 고정한다.
/// (WKWebView 기본 UA에는 `Version/… Safari/…`가 없어 "임베디드 브라우저"로 판정됨)
pub const SAFARI_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PanelLayout {
    pub service_id: String,
    pub rect: Rect,
}

fn panel_label(service_id: &str) -> String {
    format!("panel-{service_id}")
}

/// 서비스 id → 고정 16바이트 식별자. WKWebsiteDataStore 파티션 키로 쓰인다.
/// 앱을 재시작해도 같은 id면 같은 스토어(쿠키·로컬스토리지)를 연다.
fn data_store_id_for(service_id: &str) -> [u8; 16] {
    fn fnv1a64(bytes: &[u8]) -> u64 {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for b in bytes {
            h ^= *b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01b3);
        }
        h
    }
    let lo = fnv1a64(format!("jilseo:{service_id}").as_bytes());
    let hi = fnv1a64(format!("jilseo:{service_id}:store").as_bytes());
    let mut out = [0u8; 16];
    out[..8].copy_from_slice(&lo.to_be_bytes());
    out[8..].copy_from_slice(&hi.to_be_bytes());
    out
}

#[tauri::command]
pub fn create_panel(
    app: AppHandle,
    service_id: String,
    url: String,
    rect: Rect,
) -> Result<String, String> {
    let label = panel_label(&service_id);
    if app.get_webview(&label).is_some() {
        return Ok(label);
    }
    let window = app
        .get_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let parsed = url.parse().map_err(|e| format!("invalid url {url}: {e}"))?;

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed))
        .data_store_identifier(data_store_id_for(&service_id))
        .user_agent(SAFARI_USER_AGENT)
        .zoom_hotkeys_enabled(true);

    window
        .add_child(
            builder,
            LogicalPosition::new(rect.x, rect.y),
            LogicalSize::new(rect.width, rect.height),
        )
        .map_err(|e| format!("add_child failed for {service_id}: {e}"))?;
    Ok(label)
}

#[tauri::command]
pub fn layout_panels(app: AppHandle, layouts: Vec<PanelLayout>) -> Result<(), String> {
    for PanelLayout { service_id, rect } in layouts {
        let Some(webview) = app.get_webview(&panel_label(&service_id)) else {
            continue;
        };
        webview
            .set_position(LogicalPosition::new(rect.x, rect.y))
            .map_err(|e| e.to_string())?;
        webview
            .set_size(LogicalSize::new(rect.width, rect.height))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn destroy_panel(app: AppHandle, service_id: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&panel_label(&service_id)) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn panel_url(app: AppHandle, service_id: String) -> Result<Option<String>, String> {
    match app.get_webview(&panel_label(&service_id)) {
        Some(webview) => webview
            .url()
            .map(|u| Some(u.to_string()))
            .map_err(|e| e.to_string()),
        None => Ok(None),
    }
}
