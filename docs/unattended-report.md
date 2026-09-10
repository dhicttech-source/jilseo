# 무인 작업 보고서 (출장 기간, 2026-09-10 ~)

> 사용자 부재 중 Claude가 수행한 작업과 결과. 테스트 전송 상한 8회 (사용자 승인).
> 검증 수단: 개발 빌드 전용 테스트 하네스 (`scripts/harness.py` → `dev_commands.json` / `dev_results.json`). dmg에는 포함되지 않음.

## 테스트 전송 사용 내역

| # | 시각 | 내용 | 대상 | 결과 |
|---|---|---|---|---|
| 1 | 11:22 | 질서 자동 테스트 1: 한 줄로 인사만 해줘. | chatgpt·claude (gemini 의도적 실패, perplexity TODO) | 2/4 전송 444ms, 격리 확인 |
| 2 | 11:29 | 질서 자동 테스트 2: 마크다운 예시 요청 | chatgpt·claude·gemini | 3/3 전송 388ms, 응답 3개 Markdown으로 저장 확인 |
| 3 | 11:35 | 질서 자동 테스트 3: 첨부 파일의 비밀 단어 | chatgpt·claude·gemini | 3/3 전송 1243ms. **첨부가 실제로는 붙지 않음**(하네스 명령 유실) → 파일 첨부 검증은 미완 |
| 4 | 18:05 | 테스트 4: 첨부 + 비밀 단어 (복귀 후) | chatgpt·claude·gemini | Claude 정답(첨부 OK). ChatGPT는 업로드 중 버튼 비활성 → Enter 폴백 무시. Gemini는 file input 없음 |
| 5 | 18:29 | 테스트 5 (의도치 않게 재실행) | chatgpt·claude·gemini | 앱 재시작 시 하네스가 옛 명령을 재실행. 첨부 없이 나감 → 하네스에 만료 규칙 추가 |
| 6 | 18:54 | 테스트 6: 첨부 + 비밀 단어 | 5패널 | Claude·Gemini 정답(**Gemini 업로드 메뉴 경로 성공**). ChatGPT 첨부는 되나 빈 응답. Grok 미전송. Perplexity paste 비동기 실패 |
| 7 | 19:01 | 테스트 7: 텍스트만, 토큰 질서-OK-7 | 5패널 | 5/5 전송 1418ms. Claude·Perplexity 토큰 정답, Gemini 응답 수집. ChatGPT 응답 없음. Grok 응답 없음 |
| 8 | 19:06 | 테스트 8: Grok 단독, 토큰 질서-OK-8 | grok | 입력은 비워지나 메시지 미생성 → **Grok에 '나이 확인' 모달이 떠 있어 차단됨** (사용자 처리 필요) |

## 1. 하네스·메모 보강 (완료)
- 패널 init script가 선택 텍스트를 추적 → "메모" 클릭으로 패널 포커스가 빠져도 직전 선택(60초 이내) 사용
- 검증: ChatGPT 패널 텍스트 21자 프로그램 선택 → 메모 저장 OK / 선택 해제 후 메모 → 폴백으로 저장 OK / 선택 없는 패널 → "선택된 텍스트 없음" OK
- 테스트로 생긴 notes 2건은 작업 종료 시 삭제

## 2. Phase 1 잔여 검증
- 최대화/복귀: 하네스로 chatgpt 최대화 → 스크린샷에서 스테이지 전체 차지 확인, settings.maximized 저장 확인 → 복귀 시 2×2 원상 OK
- 셀렉터 JSON 수정 → 재시작 반영: `~/Library/Application Support/jilseo/services/gemini.json`의 input을 `#없는입력창`으로 → `scripts/dev-restart.sh` → 진단에서 gemini input=false → 테스트 전송 #1에서 gemini만 'input not found', chatgpt·claude 전송 → 원복 → 재시작 → 진단 전부 found. **통과**
- 지시문 §7 완료 기준: dmg 2대 설치 항목 외 4개 모두 충족

## 3. Phase 3 (구현 완료, 일부 검증)
- **응답 Markdown 변환**: turndown 적용. 테스트 전송 #2에서 세 서비스 응답이 제목(#)·목록(-)·펜스 코드(```)로 저장됨 → **통과**
- **웹슬롯·즐겨찾기**: Hacker News 웹슬롯 추가 → "웹" 배지 패널, 독에 ★/✕, 전송 대상에서 제외 확인(스크린샷) → **통과**. 테스트 후 제거
- **파일 Broadcast**: 코드 완료(`input.files` → drop → paste 폴백). 테스트 전송 #3은 첨부 명령이 하네스 재시작 중 유실되어 파일 없이 나감 → **미검증**. 복귀 후 📎 버튼으로 텍스트 파일 첨부해 확인 필요
- 발견·수정: 기존 대화가 있는 패널에서 이전 응답을 새 응답으로 오인하던 문제 → 전송 전 스냅샷과 비교(`snapshotResponse`)로 해결

## 4. 무인 작업 중단 사유 — 화면 잠금 (11:38)
- 증상: 11:40부터 UI가 죽고 이후 모든 webview가 흰 화면. 코드 버그로 의심해 이분 탐색까지 했으나 원인은 **화면 잠금**(`CGSSessionScreenIsLocked = true`, 11:38:13).
- 원리: 잠금 화면이 창을 가리면 WKWebView가 페이지를 hidden으로 바꿔 타이머를 멈추고 렌더링을 중단한다 (하트비트가 약 7초에서 정지). 언로드·크래시 없음.
- 결론: **화면이 잠긴 동안에는 앱이 아무 동작도 하지 않는다.** 제품 제약으로 온보딩·문서에 명시. 무인 UI 테스트는 잠금 해제 상태에서만 가능.
- 조치: 이분 탐색용 임시 코드 전부 원복, 스테이지 구성을 사용자 상태(ChatGPT·Claude·Gemini·Perplexity, 2열)로 복구, 앱 재시작.
- 남은 무인 작업은 UI 불필요 항목만 진행: 코드 품질 점검, Supabase keepalive, Windows 분기(컴파일만), 문서, dmg 빌드.

## 5. 품질 점검 (intent-review · ai-coding-checklist)
- 배포 체크리스트: `docs/reviews/deploy-checklist-2026-09-10.md` — 🔴 0 / 🟡 7 / 🔍 3 / ✅ 17 / N/A 9. Git 이력·소스에 키 없음, npm 취약점 0건. `innerHTML` 1곳을 `textContent`로 교체
- 우선순위: ① Supabase 가입 차단 + 수동 백업 주기(대시보드, 사용자) ② supabase-js fetch 타임아웃(다음 수정) ③ 온보딩에 저장 위치 안내
- 보고서: `docs/reviews/intent-review-2026-09-10.md` (후보 9건: high 3 / medium 5 / low 1)
- 적용한 것(동작 불변, 기계적 추출): 클라우드 행 저장 규칙 `saveRow()`로 통합(3곳), 열 수 클램프 `clampColumns()`, 서비스 합성 `composeServices()`, 스테이지 정합성 `sanitizeStage()`, TODO 셀렉터 센티널 상수
- 남긴 것: `runBroadcast()` 2단계 분리, `broadcastText`/`addWebSlot` 개명 — 동작 변경이라 사용자 확인 후

## 6. 기타
- Supabase keepalive: launchd `com.dhict.jilseo.keepalive` 등록, 매일 09:15 REST 호출. 첫 실행 http 200 (`~/Library/Application Support/jilseo/keepalive.log`)
- Phase 4 준비: 세션 파티션·UA를 플랫폼별 함수로 분리, nsis 타깃 추가. macOS 컴파일 확인. Windows 빌드는 Windows 머신 필요
- 새 dmg: `release/jilseo_0.1.0_aarch64.dmg` (HEAD a87aaa8 기준, Phase 3·품질 수정 포함, 안내문 동봉). sha256 8e451341…7f05aa
- 개발용 앱은 종료해 두었음. 복귀 후 `cd ~/dev/jilseo && npm run tauri dev`로 실행

## 7. 복귀 후 세션 (2026-09-10 18:00~)

### 진짜 원인: 창 가림 → WebKit 정지 (잠금은 그 한 경우)
- 화면이 잠기지 않았는데도 UI가 죽음 → `visibilityState=hidden`, 하트비트 6초 정지. z-order 조사 결과 **Claude 앱 창이 질서 창을 완전히 덮고 있었음**.
- macOS WebKit은 가려진 webview를 hidden으로 보고 타이머·렌더링을 정지시킨다. 잠금 화면도 같은 메커니즘.
- **해결**: UI·패널 webview 모두 `background_throttling(Disabled)` (Tauri 2, macOS 14+). 적용 후 가려진 상태에서도 하트비트 지속 확인.
- 온보딩의 "화면이 잠기면 멈춤" 문구는 이제 완화 가능 (다음 dmg에서 반영).

### 앱 크래시: 개발용 감시 스레드의 `url()` 호출
- wry는 페이지 전환 중 URL이 nil이면 `unwrap` panic → 메인 스레드 panic으로 앱 종료.
- 감시 스레드에서 URL 폴링 제거, `panel_url`/`list_webviews`는 `catch_unwind`로 보호.

### 하네스 안전장치
- 명령에 `at` 부여, 60초 지난 명령 무시, 시작 시 마지막 결과 id 상속 → 재시작 시 옛 전송 재실행 방지.
- 하트비트는 `dev_heartbeat.json`으로 분리 (결과 파일 덮어쓰기 방지).

### 어댑터 실측 추가
- **Grok**: input `div.tiptap[contenteditable]`, send `button[data-testid="chat-submit"]`, fileInput `input[type=file]`
- **Perplexity**: input `#ask-input` (execCommand 무시 → paste 이벤트 삽입, 비동기 반영이라 readback 확인), send `button[aria-label="제출"]`, fileInput `input[type=file]`, fileMenu "파일 또는 도구 추가"
- **Gemini** 파일 첨부: `fileMenu`("업로드 및 도구") 클릭 → `input.hidden-file-input` 생성 → files 설정 → Escape. **동작 확인**
- **ChatGPT** 파일 첨부: 칩까지 붙고 전송되지만 응답이 빈 자리표시자로 남음(2회 재현). 무료 플랜의 파일 처리 제한으로 추정 → 사용자가 패널에서 직접 확인 필요
- submit: 버튼이 비활성(업로드 중)이면 최대 12초 재시도. click 후 입력창이 비워지지 않으면 `form.requestSubmit()` → Enter 순 폴백
- **Perplexity 전송·응답 검증 완료** (토큰 정답, response `[class*="prose"]`)
- **Grok**: 전송 코드는 준비됐으나 패널에 "나이를 확인해 주세요" 모달이 떠 있어 메시지가 생성되지 않음. 사용자가 모달을 한 번 처리하면 재검증 필요 (전송 상한 8회 소진)
- **ChatGPT**: 텍스트 전송(테스트 7)에도 응답이 빈 자리표시자로 남음(3회 연속, 첫 세션 11:29에는 정상). 패널에서 직접 확인 필요 — 무료 플랜 한도 도달 가능성

## 테스트 전송 집계: 8/8 사용 (사용자 승인 상한 도달, 추가 전송 없음)

## 사용자 확인 필요
- Grok · Perplexity 로그인 후 셀렉터 실측
- MacBook에 새 dmg 설치, 같은 Supabase 계정 로그인 → 프롬프트 공유 확인
- **파일 첨부 전송 1회** (📎로 작은 txt 첨부 → "첨부 파일 내용 요약해줘") — 세 서비스에 실제 첨부되는지
- 테스트로 생긴 notes 2건·comparisons 3건("질서 자동 테스트 N")은 그대로 두었음. 지워도 됨
- 이후 무인 테스트를 맡길 때는 화면 잠금을 해제해 두거나(시스템 설정 → 잠금 화면 → 화면 보호기 후 잠금 "안 함"), 테스트 후 다시 켜기
