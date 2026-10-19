# 질서(jilseo) 개발 계획

> 원본 지시문: `docs/JILSEO-DIRECTIVE.md`. 이 문서는 지시문을 실행 단위로 쪼갠 것.
> 작성일: 2026-09-10

## 0. 환경 점검 결과 (2026-09-10)

| 항목 | 상태 | 조치 |
|---|---|---|
| macOS | 26.6.2 (Darwin 25.6) | OK |
| Xcode CLT | `/Library/Developer/CommandLineTools` | OK |
| Node | v22.22.3 / npm 10.9.8 | OK |
| Rust (rustup/cargo/rustc) | **없음** | rustup 설치 필요 (Tauri 필수) |
| Tauri CLI | 없음 | 프로젝트 devDependency(`@tauri-apps/cli`)로 설치 |
| 개발 폴더 | `~/dev/jilseo` 생성 완료 | — |
| Day 1 판정 | **GO** (2026-09-10) | `docs/day1-verification.md` |
| Phase 1 | 핵심 완료 (2026-09-10) | `docs/adapter-test.md` |
| Phase 2 | 완료 — Supabase 로그인·프롬프트·비교 기록·메모 저장 확인 (2026-09-10) | `docs/CHANGELOG.md` |
| Phase 3 | 구현 완료 — 마크다운·웹슬롯 검증, 파일 첨부는 사용자 검증 대기 (2026-09-10) | `docs/unattended-report.md` |
| Phase 4 | 1단계 진행 중 — GitHub Actions Windows 빌드 + 노트북 Day 1 검증 (2026-09-18) | `docs/day1-verification-windows.md` |
| 파이프라인 모드 | 구현 (2026-09-29) — 생성 1 → 검증 N, 역할 칩·템플릿·워크스테이션 저장. 자동 라우팅은 보류(기록이 쌓인 뒤 "추천"으로만 검토) | `docs/CHANGELOG.md` |
| 검증 렌즈 A~D | 구현 완료 (2026-09-30) — 렌즈 8개·판정 파싱·채택 클릭, 프리셋 5종·깊이·카드 정렬, 수정 단계, 성적표·배정 추천 | `docs/verification-lens-design-2026-09-30.md` |
| LibreChat 반영 | 1~4 완료 (2026-10-19): CI·셀렉터 스키마·임시 전송·Markdown 내보내기. 진행 예정 5~8: 프롬프트 변수, 기록 검색·태그, 전송 횟수 카운터, 워크스테이션 프롬프트 접두어. 그다음 백로그: 동의 근거·합의 요약(설계 §10) | `docs/librechat-review-2026-10-19.md` |

## 1. Tauri 2 핵심 기술 결정 (Day 1 검증 대상)

| 요구사항 | Tauri 2 수단 | 리스크 |
|---|---|---|
| 창 하나에 webview N개 | `tauri` crate `unstable` feature + `Window::add_child(WebviewBuilder, position, size)` | multiwebview는 공식 unstable. 막히면 Electron 전환 |
| 서비스별 세션 파티션 | `WebviewBuilder::data_store_identifier([u8;16])` (macOS 14+, WKWebsiteDataStore 분리) | 재시작 후 쿠키 유지 여부가 Day 1 핵심 검증 |
| Google 로그인 통과 | `WebviewBuilder::user_agent(Safari 최신 UA)` | 막히면 UA 조정 → 그래도 막히면 Electron |
| 어댑터 주입 | `WebviewBuilder::initialization_script` + `Webview::eval` | 원격 도메인 IPC는 capability `remote.urls` 허용 필요 |
| 응답 수집 (webview→앱) | 원격 URL capability로 `invoke`/`emit` 허용 | Phase 2에서 검증 |
| 패널 배치 | React 레이아웃이 각 슬롯의 rect를 계산 → IPC로 Rust에 전달 → `set_position/set_size` | 리사이즈 동기화 지연 가능 |

## 2. 프로젝트 구조

```
jilseo/
├── docs/                      # 지시문, 계획, day1-verification, adapter-test, CHANGELOG
├── src/                       # React + TS + Vite (Tailwind, 다크 기본)
│   ├── app/                   # App.tsx, 레이아웃(Stage/Dock/BroadcastBar)
│   ├── adapters/              # ServiceAdapter 구현 (chatgpt.ts, claude.ts, ...)
│   ├── inject/                # 각 webview에 주입되는 스크립트 (빌드 시 문자열로 번들)
│   ├── store/                 # zustand: 패널 상태, 워크스테이션
│   └── lib/                   # ipc 래퍼, supabase 클라이언트(Phase 2)
├── services/                  # 서비스 정의 JSON (셀렉터 외부화) — 앱 리소스로 번들 + 사용자 폴더 오버라이드
│   ├── chatgpt.json  claude.json  gemini.json  grok.json  perplexity.json
├── src-tauri/
│   ├── Cargo.toml             # tauri = { features = ["unstable"] }
│   ├── tauri.conf.json
│   ├── capabilities/          # main.json (앱 UI), remote.json (원격 webview IPC 허용)
│   └── src/
│       ├── main.rs / lib.rs
│       ├── webviews.rs        # 생성/파괴/배치/eval 커맨드
│       ├── sessions.rs        # data_store_identifier 관리
│       └── storage.rs         # ~/Library/Application Support/jilseo/*.json
└── package.json
```

## 3. 단계별 작업

### Day 1 — Go/No-Go 검증 (Phase 1 UI 착수 전 필수 게이트)

1. rustup 설치 (stable), `rustup target` 확인
2. `npm create tauri-app` (react-ts, vite) → `~/dev/jilseo`에 스캐폴딩, git init
   - GitHub 원격 저장소 생성: `dhicttech-source/jilseo` (2026-10-17 공개 전환, MIT), 초기 커밋 push
3. `src-tauri` 설정: `unstable` feature, macOS 최소 버전 14.0, ad-hoc 서명
4. Rust 커맨드 `create_panel(service_id, url, rect)` / `layout_panels(rects)` / `destroy_panel` 구현
   - `data_store_identifier` = 서비스 id의 고정 해시 16바이트
   - user_agent = Safari 최신 UA 고정
5. React: 3열 고정 스테이지(ChatGPT·Claude·Gemini) + 리사이즈 시 rect 재전달
6. **사용자 수동 검증**: `npm run tauri dev` → 세 서비스 로그인 → 앱 종료·재시작 → 로그인 유지 확인
7. 결과를 `docs/day1-verification.md`에 기록. 실패 항목별 대응(UA 조정 → Electron 전환) 결정

**Day 1 완료 기준**: 세 서비스 모두 로그인 성공 + 재시작 후 유지. 미충족 시 Phase 1 착수 금지.

### Day 2~3 — Phase 1

- `services/*.json` 5종 (실제 DOM 확인 후 작성, 미확인 시 `TODO(selector)`)
- `inject/` 어댑터 런타임: insertText(execCommand/InputEvent) → submit → MutationObserver(3초 무변화=done)
- Broadcast 바(300ms 랜덤 지터), Dock, 슬롯 최대화, 마지막 패널 구성 복원(`settings.json`)
- 패널별 실패 격리(try/catch + 타임아웃, 패널 상태 배지)
- `docs/adapter-test.md` 체크리스트, `docs/CHANGELOG.md`

### Day 4~5 — Phase 2

- 워크스테이션 저장/복원(`workstations.json`, 각 패널 conversationUrl)
- Supabase **Free 플랜** 조직에 별도 프로젝트 `jilseo` 생성(사용자), 스키마 SQL + RLS, 이메일 로그인 1계정, 로컬 세션 파일
  - Free 프로젝트 7일 비활성 일시정지 방지: Mac Studio cron 일 1회 REST 호출 (별도 작업)
- 프롬프트 라이브러리 / 메모 / 비교 기록 + 실패 시 로컬 큐 재시도
- `tauri build` → dmg → MacBook 병행 검증
- **dmg 첫 실행 안내** (사용자 요청 2026-09-10): ad-hoc 서명·미공증이라 다른 맥에서는 Gatekeeper가 막힘 →
  - dmg 안에 `처음 실행하는 법.rtf` 동봉 + dmg 배경 이미지에 3단계(앱을 Applications로 드래그 → 우클릭 '열기' 또는 `xattr -cr` → 각 서비스 로그인) 표기
  - 앱 첫 실행 온보딩 화면: 서비스별 로그인 방법, 패스키 불가·비밀번호 로그인 안내, 셀렉터 JSON 위치 안내
  - 배포 범위가 넓어지면 Apple Developer Program 가입 후 Developer ID 서명 + 공증으로 전환 (tauri.conf `bundle.macOS.signingIdentity`, 공증 env)

### 이후 — Phase 3

- 파일 Broadcast(DataTransfer + drop), 웹슬롯, 즐겨찾기, turndown 마크다운 변환

### Phase 4 — Windows 버전 (사용자 요청 2026-09-10, macOS 완료 후 착수)

Tauri 2는 Windows에서 WebView2(Chromium)로 동작하며 프론트·어댑터 코드는 그대로 재사용한다. 바뀌는 것은 Rust 브리지의 플랫폼 분기와 패키징.

| 항목 | macOS | Windows | 작업 |
|---|---|---|---|
| 세션 파티션 | `data_store_identifier` | `data_directory(<app_data>/partitions/<id>)` | `cfg(target_os)` 분기 |
| User-Agent | Safari 고정 | WebView2 기본(Edge). Google 로그인 차단 시 Chrome UA로 고정 | Day 1과 같은 Go/No-Go 검증 반복 |
| 팝업(OAuth) | wry `Allow` | wry `Allow` (WebView2 NewWindowRequested) | 동작 확인만 |
| 타이틀바 인셋 | 32px 자가 보정 | 0 예상, 같은 코드로 자가 보정 | 확인만 |
| 패스키 | 불가 | WebView2는 Windows Hello 패스키 가능성 있음 | 실측 |
| 설치 파일 | dmg | NSIS `.exe` 또는 MSI (`tauri build` targets) | 설정 추가 |
| 서명 | ad-hoc | 미서명 시 SmartScreen 경고 → 첫 실행 안내에 '추가 정보 → 실행' 절차 포함 | 안내 문서 |
| 빌드 환경 | 로컬 맥 | **맥에서 크로스 빌드 불가** → Windows PC 또는 GitHub Actions `windows-latest` 러너 | 지시문의 'CI 없음' 원칙과 충돌하므로 착수 시 결정 필요 |
| 로컬 저장 경로 | `~/Library/Application Support/jilseo` | `%APPDATA%\jilseo` (`data_dir()`가 자동 처리) | 없음 |

순서: (1) Windows 빌드 환경 확보 — **GitHub Actions `windows-latest`로 결정 (2026-09-18)**, 테스트는 사용자 Windows 노트북 → (2) Day 1 검증 재현(3서비스 로그인·유지) → (3) 파티션·UA 분기(구현됨, `force-chrome-ua` 플래그) → (4) 어댑터 테스트 체크리스트 재실행 → (5) 설치 파일 + 첫 실행 안내(`docs/windows-first-run.md`)

## 4. 제약 재확인

> **2026-10-08 변경(사용자 결정)**: 별도 Supabase Free 프로젝트 `jilseo` 대신 사용자의 기존(유료) Supabase 프로젝트에 `jilseo_` 접두어 테이블로 함께 둔다. 계정 하나로 관리하기 위해서이며, Free 일시정지 방지용 keepalive(launchd)는 제거했다. RLS는 그대로 본인 행만.

- API 호출 금지. DOM 주입만.
- 자동 반복 전송 없음. 전송 간 300ms 랜덤 지터.
- 쿠키·로그인 정보는 앱이 만지지 않음(WKWebsiteDataStore에 위임).
- 셀렉터는 JSON 외부화, 추정값 금지.
