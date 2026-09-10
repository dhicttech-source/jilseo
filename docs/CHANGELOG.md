# CHANGELOG — 질서(jilseo)

## [Unreleased]

## Phase 2 — 2026-09-10 (구현 완료, Supabase 연동 검증 대기)

### Added
- 워크스테이션: 현재 패널 구성 + 각 패널 대화 URL 저장/전환/덮어쓰기/삭제 (`workstations.json`)
- Supabase 연동: `supabase/schema.sql`(prompts·notes·comparisons + RLS), 이메일 로그인, 세션은 `session.json`에 보관
- 오프라인 큐: 저장 실패 시 `queue.json`에 적재, 로그인·다음 저장 시 재시도
- 프롬프트 라이브러리(📚): 폴더별, 클릭 시 입력창 삽입, 로컬 캐시 + 클라우드 동기화
- 메모: 패널 헤더 "메모" → 패널 안 선택 텍스트를 서비스·대화 URL·시각과 함께 저장
- 비교 기록: Broadcast 1회 = 1레코드, 모든 패널 응답 완료 후 저장, device 필드
- 설정 화면(Supabase URL·anon key·로그인·기기 이름), 첫 실행 온보딩(패스키·팝업·셀렉터 안내)
- dmg: 배경 이미지에 설치 3단계, `처음 실행하는 법.txt` 동봉 (`npm run dmg` → `scripts/finish-dmg.sh`)

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
