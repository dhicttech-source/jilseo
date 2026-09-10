# Day 1 — Go/No-Go 검증 기록

> 목적: Tauri 2 multiwebview로 ChatGPT·Claude·Gemini를 한 창에 띄우고, 로그인 및 앱 재시작 후 로그인 유지 여부를 확인한다.
> 이 결과가 나오기 전에는 Phase 1 UI 작업을 시작하지 않는다.

## 구성

| 항목 | 값 |
|---|---|
| 검증일 | 2026-09-10 |
| 기기 | Mac Studio M4 Max, macOS 26.6.2 |
| Tauri | 2.11.5 (`unstable` feature, `Window::add_child`) |
| wry / tao | 0.55.1 / 0.35.3 |
| 세션 분리 | `WebviewBuilder::data_store_identifier` (서비스 id → FNV-1a 16바이트) |
| User-Agent | Safari 26 고정 (`webviews.rs` `SAFARI_USER_AGENT`) — Google 임베디드 브라우저 차단 회피 목적으로 처음부터 적용 |

## 실행 방법

```bash
npm run tauri dev
```

## 체크리스트 (사용자 수동 검증)

### A. 기본 동작 (Claude가 스크린샷으로 확인, 2026-09-10 09:46)
- [x] 창 1개에 ChatGPT / Claude / Gemini 패널 3개가 좌우로 표시됨
- [ ] 창 크기 변경 시 세 패널이 슬롯에 맞춰 따라옴 (사용자 확인 필요)
- [x] 패널 헤더 상태 점이 초록(●)으로 표시됨 (실패 시 빨강)
- [x] 세 사이트 모두 정상 로드. Claude 패널에는 Google 원탭 로그인 프롬프트까지 표시됨 → Safari UA가 Google에 "정상 브라우저"로 인식되는 신호

### B. 로그인 (사용자 수행, 2026-09-10 ~10:00)
- [x] ChatGPT 로그인 성공 (방식: Google 계정, 패스키 대신 비밀번호 경로)
- [x] Claude 로그인 성공 (방식: Google 계정, 팝업 허용 후)
- [x] Gemini(Google) 로그인 성공 (방식: Google 계정, 패스키 대신 비밀번호 경로)
  - 1차 시도에서 막힌 메시지: 패스키 요구 → 발견 사항 2번 참조

### C. 세션 유지 (Claude가 SIGTERM 종료 → 재실행 → 스크린샷 확인, 2026-09-10 10:0x)
- [x] 앱 종료 후 재실행 → ChatGPT 로그인 유지 ("플랜 업그레이드" 표시, 로그인 버튼 없음)
- [x] 앱 종료 후 재실행 → Claude 로그인 유지 ("안녕하세요!" 입력창, 모델 선택기 표시)
- [x] 앱 종료 후 재실행 → Gemini 로그인 유지 ("Gemini Pro" 표시)
- 비고: ⌘Q가 아니라 `kill -TERM`(정리 없는 강제 종료)이었는데도 유지됨 → WKWebsiteDataStore가 쿠키를 즉시 디스크에 기록함

### D. 파티션 격리 (선택)
- [ ] 한 패널에서 로그아웃해도 다른 패널 세션에 영향 없음

## 결과

| 서비스 | 로그인 | 재시작 후 유지 | 비고 |
|---|---|---|---|
| ChatGPT | O (Google, 비밀번호) | O | 패스키 불가 |
| Claude | O (Google, 팝업) | O | 팝업 허용 패치 필요했음 |
| Gemini | O (Google, 비밀번호) | O | 패스키 불가 |

## 판정

- [x] **GO** — 세 서비스 모두 로그인 + 유지. Phase 1 착수. (판정일 2026-09-10)
- [ ] **UA 조정 후 재시도** — Gemini만 실패. `SAFARI_USER_AGENT` 변경 후 재검증.
- [ ] **NO-GO → Electron 전환** — UA 조정 후에도 실패, 또는 multiwebview 자체 불안정.

## 발견 사항 / 이슈

### 1. 자식 webview y좌표가 타이틀바 높이만큼 위로 올라감 (해결)
- 증상: DOM 슬롯 좌표를 그대로 넘기면 패널이 약 32px 위에 그려져 슬롯 헤더를 덮음.
- 원인: macOS 26에서 창 콘텐츠 뷰가 타이틀바까지 덮는 구조(native inner height 1000)인데,
  UI webview의 DOM은 타이틀바 안전영역만큼 아래에서 시작(DOM height 968).
  wry는 부모 NSView 높이로 y를 뒤집으므로 자식 webview 원점은 콘텐츠 뷰 최상단.
- 해결: `src/lib/panels.ts` `measureViewportInset()` — `window.innerSize()/scaleFactor − document.documentElement.clientHeight`를
  y 보정값으로 사용. 실측 inset=32. 리사이즈 때마다 재측정하므로 다른 맥/해상도에서도 자가 보정.

### 2. 패스키(WebAuthn) 로그인 불가 — WKWebView 구조적 한계 (우회: 비밀번호 로그인)
- 증상 (2026-09-10 사용자 1차 시도): ChatGPT·Gemini 모두 Google 계정 로그인 단계에서 패스키 요구.
  ChatGPT는 "블루투스가 켜져 있고 기기가 가까이 있는지 확인" 오류, Gemini는 "패스키를 사용하여 본인임을 확인" 화면에서 진행 불가.
- 원인: WKWebView의 WebAuthn은 Apple 승인 브라우저 entitlement(`com.apple.developer.web-browser`) 또는
  associated domains가 있는 앱에서만 동작. ad-hoc 서명 개인 앱은 해당 없음 → Touch ID·휴대폰 QR(hybrid) 모두 실패.
- Electron(Chromium)도 Touch ID 패스키가 Chrome 전용 계층이라 동일하게 불가 → **전환 사유 아님**.
- 우회: 패스키 화면의 "다른 방법 시도" → 비밀번호 입력(+2단계 인증 코드). Google 계정에 "가능하면 비밀번호 건너뛰기"가 켜져 있으면 끈다.
  세션은 파티션에 저장되므로 최초 1회만 필요.

### 3. Claude "로그인 중 오류" — window.open 팝업 차단 (해결)
- 증상: claude.ai "Google로 계속하기" 클릭 → "로그인 중 오류가 발생했습니다".
- 원인: claude.ai의 OAuth는 `window.open` 팝업. wry는 new-window 핸들러가 없으면 팝업을 조용히 거부.
- 해결: `webviews.rs` `popup_policy` — https 팝업은 `NewWindowResponse::Allow`(호출 webview와 쿠키 저장소 공유), 그 외 Deny.
- 남은 제약: wry가 `window.close()`(webViewDidClose)를 처리하지 않아 OAuth 완료 후 팝업을 수동으로 닫아야 할 수 있음.

### 4. Tauri multiwebview 안정성
- `unstable` feature + `Window::add_child` 3개 동시 생성·배치 정상. 크래시 없음.
- 원격 URL webview는 capability를 주지 않아 IPC 차단 상태 (의도된 격리).
