# CHANGELOG — 질서(jilseo)

## [Unreleased]

## Day 1 — 2026-09-10 (Go/No-Go 검증: GO)

### Added
- Tauri 2.11.5 `unstable` multiwebview 기반 3열 스테이지 (ChatGPT · Claude · Gemini)
- Rust 브리지 `create_panel` / `layout_panels` / `destroy_panel` / `panel_url`
- 서비스별 세션 파티션 (`data_store_identifier`, FNV-1a 16바이트)
- Safari 26 User-Agent 고정
- https `window.open` 팝업 허용 (OAuth 로그인용)
- 서비스 정의 `services/*.json` 5종 (셀렉터는 Phase 1에서 실측 후 기입)
- 타이틀바 인셋 자가 측정으로 자식 webview y좌표 보정

### Verified
- 세 서비스 로그인 성공 + 강제 종료 후 재실행 시 로그인 유지 (`docs/day1-verification.md`)

### Known limitations
- 패스키(WebAuthn) 로그인 불가 — WKWebView 브라우저 entitlement 필요. 비밀번호 로그인으로 우회
- OAuth 팝업이 `window.close()`로 자동 닫히지 않을 수 있음
