mod webviews;

use tauri::{webview::WebviewBuilder, LogicalPosition, LogicalSize, WebviewUrl};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // multiwebview: 창을 먼저 만들고, 앱 UI webview를 자식으로 붙인다.
            // 서비스 패널 webview는 프론트가 슬롯 좌표를 계산해 create_panel로 붙인다.
            let window = tauri::window::WindowBuilder::new(app, "main")
                .title("질서 疾書")
                .inner_size(1600.0, 1000.0)
                .min_inner_size(900.0, 600.0)
                .build()?;

            let scale = window.scale_factor()?;
            let size = window.inner_size()?.to_logical::<f64>(scale);

            window.add_child(
                WebviewBuilder::new("ui", WebviewUrl::App("index.html".into())).auto_resize(),
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(size.width, size.height),
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            webviews::create_panel,
            webviews::layout_panels,
            webviews::destroy_panel,
            webviews::panel_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
