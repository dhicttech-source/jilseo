//! 로컬 저장소: `~/Library/Application Support/jilseo/`
//! - settings.json      마지막 패널 구성 등
//! - services/*.json    서비스 정의(셀렉터). 최초 실행 시 번들 리소스에서 시드, 이후 사용자 편집본 우선.

use std::{fs, path::PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager};

fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .data_dir()
        .map_err(|e| e.to_string())?
        .join("jilseo");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn user_services_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join("services");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn bundled_services_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("services"))
}

/// 번들에는 있고 사용자 폴더에는 없는 정의만 복사한다 (사용자 편집본은 덮어쓰지 않음).
fn seed_missing_services(app: &AppHandle) -> Result<(), String> {
    let src = bundled_services_dir(app)?;
    let dst = user_services_dir(app)?;
    let Ok(entries) = fs::read_dir(&src) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let target = dst.join(entry.file_name());
        if !target.exists() {
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn services_dir(app: AppHandle) -> Result<String, String> {
    Ok(user_services_dir(&app)?.to_string_lossy().into_owned())
}

/// 사용자 폴더의 서비스 정의를 모두 읽는다. 깨진 JSON은 건너뛰고 `errors`로 보고한다.
#[tauri::command]
pub fn load_services(app: AppHandle) -> Result<Value, String> {
    seed_missing_services(&app)?;
    let dir = user_services_dir(&app)?;
    let mut services = Vec::new();
    let mut errors = Vec::new();
    let mut paths: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    paths.sort();
    for path in paths {
        match fs::read_to_string(&path)
            .map_err(|e| e.to_string())
            .and_then(|s| serde_json::from_str::<Value>(&s).map_err(|e| e.to_string()))
        {
            Ok(v) => services.push(v),
            Err(e) => errors.push(format!("{}: {e}", path.display())),
        }
    }
    Ok(serde_json::json!({ "services": services, "errors": errors }))
}

#[tauri::command]
pub fn read_settings(app: AppHandle) -> Result<Value, String> {
    let path = app_dir(&app)?.join("settings.json");
    if !path.exists() {
        return Ok(Value::Null);
    }
    let s = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_settings(app: AppHandle, settings: Value) -> Result<(), String> {
    let path = app_dir(&app)?.join("settings.json");
    let s = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, s).map_err(|e| e.to_string())
}

/// 진단 결과를 `diagnostics.json`에 기록 (셀렉터 존재 여부·응답 스냅샷). 사용자·개발자가 파일로 확인.
#[tauri::command]
pub fn write_diagnostics(app: AppHandle, report: Value) -> Result<String, String> {
    let path = app_dir(&app)?.join("diagnostics.json");
    let s = serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?;
    fs::write(&path, s).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// 범용 JSON 스토어. 이름은 화이트리스트로 제한한다.
const STORE_NAMES: &[&str] = &[
    "workstations", "presets", "session", "queue", "prompts_cache", "notes_cache", "favorites",
    // 개발 빌드 전용 테스트 하네스 (dmg에는 하네스 코드가 포함되지 않음)
    "dev_commands", "dev_results", "dev_heartbeat",
];

fn store_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !STORE_NAMES.contains(&name) {
        return Err(format!("unknown store: {name}"));
    }
    Ok(app_dir(app)?.join(format!("{name}.json")))
}

#[tauri::command]
pub fn read_store(app: AppHandle, name: String) -> Result<Value, String> {
    let path = store_path(&app, &name)?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let s = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_store(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    let path = store_path(&app, &name)?;
    let s = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    // 원자적 쓰기: 임시 파일 후 rename
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, s).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// 앱 데이터 폴더 경로 (온보딩 안내용)
#[tauri::command]
pub fn app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app_dir(&app)?.to_string_lossy().into_owned())
}

/// 파일을 base64로 읽는다 (파일 Broadcast·하네스용). 8MB 상한.
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<Value, String> {
    use base64::Engine;
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("{path}: {e}"))?;
    if meta.len() > 8 * 1024 * 1024 {
        return Err(format!("파일이 8MB를 넘습니다 ({} bytes)", meta.len()));
    }
    let bytes = fs::read(&p).map_err(|e| format!("{path}: {e}"))?;
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    let mime = match p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("txt") | Some("md") => "text/plain",
        Some("csv") => "text/csv",
        Some("json") => "application/json",
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/octet-stream",
    };
    Ok(serde_json::json!({
        "name": name,
        "mime": mime,
        "size": meta.len(),
        "data": base64::engine::general_purpose::STANDARD.encode(bytes),
    }))
}
