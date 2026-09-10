//! 패널(webview) 생성·배치·파괴 브리지.
//! 비즈니스 로직은 프론트에 두고, 여기서는 창 안의 webview만 다룬다.

use serde::Deserialize;
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse, WebviewBuilder},
    AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl,
};

/// Google 로그인·Cloudflare 통과율을 높이기 위해 Safari 최신 UA로 고정한다.
/// (WKWebView 기본 UA에는 `Version/… Safari/…`가 없어 "임베디드 브라우저"로 판정됨)
pub const SAFARI_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/// 모든 서비스 패널에 주입되는 최소 스크립트.
/// 선택 텍스트를 추적해 두어, 사용자가 앱 UI의 "메모" 버튼을 눌러 패널이 포커스를 잃어도 직전 선택을 읽을 수 있게 한다.
/// 페이지 로직에는 개입하지 않는다.
const PANEL_INIT_SCRIPT: &str = r#"
(() => {
  if (window.__jilseoInit) return;
  window.__jilseoInit = true;
  document.addEventListener('selectionchange', () => {
    try {
      const t = String(window.getSelection ? window.getSelection().toString() : '');
      if (t.trim()) window.__jilseoSel = { text: t, at: Date.now() };
    } catch (_) {}
  });
})();
"#;

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

/// OAuth 로그인(Google 등)은 `window.open` 팝업으로 진행되는 경우가 많다.
/// wry는 핸들러가 없으면 팝업을 조용히 거부하므로, https 팝업만 허용한다.
/// `Allow`는 호출한 webview와 같은 쿠키 저장소를 공유하는 네이티브 창을 연다.
fn popup_policy<R: tauri::Runtime>(url: Url, _features: NewWindowFeatures) -> NewWindowResponse<R> {
    if url.scheme() == "https" {
        NewWindowResponse::Allow
    } else {
        NewWindowResponse::Deny
    }
}

/// 서비스별 세션 분리. 플랫폼마다 수단이 다르다 (Phase 4 Windows 대비).
/// - macOS: `data_store_identifier` (WKWebsiteDataStore, macOS 14+)
/// - Windows/Linux: `data_directory(<app_data>/partitions/<id>)` (WebView2 user data folder)
fn apply_session_partition<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    builder: WebviewBuilder<R>,
    service_id: &str,
) -> Result<WebviewBuilder<R>, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        Ok(builder.data_store_identifier(data_store_id_for(service_id)))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let dir = app
            .path()
            .data_dir()
            .map_err(|e| e.to_string())?
            .join("jilseo")
            .join("partitions")
            .join(service_id);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(builder.data_directory(dir))
    }
}

/// User-Agent. macOS는 Safari로 고정(Google 로그인 통과). Windows(WebView2)는 기본 Edge UA를 우선 쓰고,
/// Google이 차단하면 Phase 4에서 Chrome UA 고정으로 전환한다.
fn apply_user_agent<R: tauri::Runtime>(builder: WebviewBuilder<R>) -> WebviewBuilder<R> {
    #[cfg(target_os = "macos")]
    {
        builder.user_agent(SAFARI_USER_AGENT)
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder
    }
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
        .initialization_script(PANEL_INIT_SCRIPT)
        .on_new_window(popup_policy)
        .zoom_hotkeys_enabled(true);
    let builder = apply_session_partition(&app, builder, &service_id)?;
    let builder = apply_user_agent(builder);

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

/// 패널 안에서 JS를 실행하고 결과(JSON 직렬화 문자열)를 돌려준다.
/// 원격 페이지에 IPC 권한을 주지 않고 앱 → 페이지 방향으로만 접근하는 유일한 통로.
/// 동기 표현식만 평가된다(Promise는 await되지 않음). 완료 대기는 앱 쪽에서 폴링한다.
#[tauri::command]
pub async fn eval_in_panel(
    app: AppHandle,
    service_id: String,
    js: String,
    timeout_ms: Option<u64>,
) -> Result<String, String> {
    let webview = app
        .get_webview(&panel_label(&service_id))
        .ok_or_else(|| format!("panel {service_id} not found"))?;

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    let tx = std::sync::Mutex::new(Some(tx));
    webview
        .eval_with_callback(js, move |result| {
            if let Some(tx) = tx.lock().ok().and_then(|mut t| t.take()) {
                let _ = tx.send(result);
            }
        })
        .map_err(|e| e.to_string())?;

    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(10_000));
    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(_)) => Err(format!("eval callback dropped for {service_id}")),
        Err(_) => Err(format!("eval timed out for {service_id}")),
    }
}

#[tauri::command]
pub fn set_panel_visible(app: AppHandle, service_id: String, visible: bool) -> Result<(), String> {
    let Some(webview) = app.get_webview(&panel_label(&service_id)) else {
        return Ok(());
    };
    if visible { webview.show() } else { webview.hide() }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn navigate_panel(app: AppHandle, service_id: String, url: String) -> Result<(), String> {
    let webview = app
        .get_webview(&panel_label(&service_id))
        .ok_or_else(|| format!("panel {service_id} not found"))?;
    let parsed: Url = url.parse().map_err(|e| format!("invalid url {url}: {e}"))?;
    webview.navigate(parsed).map_err(|e| e.to_string())
}

/// 진단용: 모든 webview의 라벨과 현재 URL
#[tauri::command]
pub fn list_webviews(app: AppHandle) -> Vec<(String, String)> {
    app.webviews()
        .iter()
        .map(|(label, wv)| (label.clone(), wv.url().map(|u| u.to_string()).unwrap_or_else(|e| format!("err: {e}"))))
        .collect()
}

/// UI webview를 다시 로드한다 (개발·복구용)
#[tauri::command]
pub fn reload_ui(app: AppHandle) -> Result<(), String> {
    let ui = app.get_webview("ui").ok_or("ui webview not found")?;
    ui.reload().map_err(|e| e.to_string())
}

/// 개발 빌드 전용 감시 스레드: 3초마다 모든 webview의 URL을 `dev_webviews.json`에 기록하고,
/// `dev_reload_ui` 파일이 있으면 UI webview를 리로드한다. UI가 죽어도 밖에서 진단·복구할 수 있는 통로.
#[cfg(debug_assertions)]
pub fn spawn_dev_watch(app: AppHandle) {
    use std::{fs, thread, time::Duration};
    let Ok(dir) = app.path().data_dir().map(|d| d.join("jilseo")) else { return };
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(3));
        let list: Vec<serde_json::Value> = app
            .webviews()
            .iter()
            .map(|(label, wv)| {
                serde_json::json!({
                    "label": label,
                    "url": wv.url().map(|u| u.to_string()).unwrap_or_else(|e| format!("err: {e}")),
                })
            })
            .collect();
        let payload = serde_json::json!({ "at": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0), "webviews": list });
        let _ = fs::write(dir.join("dev_webviews.json"), payload.to_string());
        let flag = dir.join("dev_reload_ui");
        if flag.exists() {
            let _ = fs::remove_file(&flag);
            if let Some(ui) = app.get_webview("ui") {
                let _ = ui.reload();
            }
        }
    });
}
