# CHANGELOG — 질서(jilseo)

## [Unreleased]

### Fixed (2026-09-10 저녁)
- **가려진 창에서 앱이 멈추던 문제**: UI·패널 webview에 `background_throttling(Disabled)` 적용 (macOS 14+). 다른 창에 덮이거나 화면이 잠겨도 전송·응답 관찰이 계속됨
- 개발 감시 스레드의 `url()` 폴링이 페이지 전환 중 panic을 일으켜 앱이 종료되던 문제 제거. `panel_url`은 panic-safe
- 전송 버튼이 비활성(파일 업로드 중)일 때 Enter 폴백으로 넘어가 전송이 누락되던 문제 → 최대 12초 활성화 대기
- 메모/워크스테이션이 쓰는 `panel_url`이 페이지 전환 중 앱을 죽일 수 있던 문제

### Added
- 파일 전송 뒤 새 채팅 이동 옵션(설정 → Broadcast, 기본 켜짐). 서비스 JSON `afterFileBroadcast: "new_chat"`(ChatGPT)
- Grok·Perplexity 셀렉터 실측 기입. Perplexity는 paste 이벤트 삽입 + readback
- Gemini 파일 첨부: 업로드 메뉴 → 숨은 file input 경로 (`fileMenu` 셀렉터)

## Phase 3 — 2026-09-10 (구현 완료; 마크다운·웹슬롯 검증, 파일 첨부는 사용자 검증 대기)

### Added
- 파일 Broadcast(📎): 파일 1개를 모든 패널에 동시 첨부. `input.files` → drop 이벤트 → paste 폴백. 8MB 상한
- 웹슬롯: 독 "+ URL"로 일반 URL 패널 추가, ★ 즐겨찾기(`favorites.json`), Broadcast 대상에서 제외
- 응답 HTML → Markdown(turndown) 변환 후 비교 기록에 저장 (버튼·svg·숨김 요소 제거, 코드 펜스 언어 유지)
- 개발 도구: 파일 기반 테스트 하네스(`scripts/harness.py`, dev 빌드 전용), `scripts/dev-restart.sh`, Rust 개발 감시 스레드(webview URL 기록·UI 리로드 플래그)
- Supabase keepalive: `scripts/keepalive.sh` + launchd `com.dhict.jilseo.keepalive` (매일 09:15)
- Phase 4 대비: 세션 파티션·UA를 플랫폼별 함수로 분리(`apply_session_partition`, `apply_user_agent`), Windows는 `data_directory`. nsis 타깃 추가(빌드는 Windows 머신 필요)

### Fixed
- 기존 대화가 있는 패널에서 이전 응답을 새 응답으로 오인 → 전송 전 스냅샷(`snapshotResponse`)과 비교
- 메모: 패널 포커스가 빠져 선택이 사라져도 init script가 기록한 직전 선택 사용

### Known limitations
- **화면 잠금 중에는 앱이 멈춤** (WKWebView가 가려진 페이지를 정지). 온보딩·설치 안내에 명시
- Grok·Perplexity 셀렉터 미실측

## Phase 2 — 2026-09-10 (Supabase 연동 검증: 로그인·프롬프트·비교 기록 OK, 메모 재검증 중)

### Added
- 워크스테이션: 현재 패널 구성 + 각 패널 대화 URL 저장/전환/덮어쓰기/삭제 (`workstations.json`)
- Supabase 연동: `supabase/schema.sql`(prompts·notes·comparisons + RLS), 이메일 로그인, 세션은 `session.json`에 보관
- 오프라인 큐: 저장 실패 시 `queue.json`에 적재, 로그인·다음 저장 시 재시도
- 프롬프트 라이브러리(📚): 폴더별, 클릭 시 입력창 삽입, 로컬 캐시 + 클라우드 동기화
- 메모: 패널 헤더 "메모" → 패널 안 선택 텍스트를 서비스·대화 URL·시각과 함께 저장
- 비교 기록: Broadcast 1회 = 1레코드, 모든 패널 응답 완료 후 저장, device 필드
- 설정 화면(Supabase URL·anon key·로그인·기기 이름), 첫 실행 온보딩(패스키·팝업·셀렉터 안내)
- dmg: 배경 이미지에 설치 3단계, `처음 실행하는 법.txt` 동봉 (`npm run dmg` → `scripts/finish-dmg.sh`)

### Verified (2026-09-10 11:10)
- Supabase Free 프로젝트 `jilseo`(Seoul) 생성, `schema.sql` 실행, 이메일 로그인 성공 (세션 `session.json` 보관)
- prompts 1건, comparisons 1건(프롬프트 "주간 날씨", 응답 3개) 클라우드 저장 확인. 큐 0건
- 비교 기록은 전송된 패널 전부의 응답이 끝난 뒤 저장됨 (Claude 도구 사용으로 지연 → 저장 확인)

### Fixed
- 설정 화면 입력창이 한 글자마다 포커스를 잃던 문제 (렌더 함수 안에서 정의한 `Field` 컴포넌트를 바깥으로 이동)
- 메모: 현재 선택이 비어 있으면 최근 60초 내 선택을 사용하도록 폴백 (init script 연동 예정)

## Phase 1 — 2026-09-10 (핵심 완료. 남은 검증: 셀렉터 JSON 수정→재시작 반영, 최대화)

### Added
- Broadcast 바: 하단 입력 → 스테이지 패널 전부에 동시 전송 (⌘⏎), 패널별 300ms 랜덤 지터, 실패 격리
- 독(Dock): 서비스 칩 토글로 스테이지 올리기/내리기 (최대 8개), 열 수 1~4 선택
- 슬롯 최대화/복귀
- 마지막 구성(패널·열·최대화) `settings.json` 저장·복원
- 셀렉터 외부화: `~/Library/Application Support/jilseo/services/*.json` (최초 실행 시 번들에서 시드, 재시작만으로 반영)
- 어댑터 런타임(`src/inject/runtime.ts`): insertText / submit / clear / readResponse / probe
- ChatGPT·Claude·Gemini 셀렉터 라이브 DOM 실측 기입, 첫 Broadcast로 응답 수집까지 확인 (Grok·Perplexity는 TODO)
- 헤더 "진단" 버튼 → `diagnostics.json` (셀렉터 존재·응답 스냅샷)
- `docs/adapter-test.md` 수동 테스트 체크리스트

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
