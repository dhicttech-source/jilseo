# 무인 작업 보고서 (출장 기간, 2026-09-10 ~)

> 사용자 부재 중 Claude가 수행한 작업과 결과. 테스트 전송 상한 8회 (사용자 승인).
> 검증 수단: 개발 빌드 전용 테스트 하네스 (`scripts/harness.py` → `dev_commands.json` / `dev_results.json`). dmg에는 포함되지 않음.

## 테스트 전송 사용 내역

| # | 시각 | 내용 | 대상 | 결과 |
|---|---|---|---|---|
| 1 | 11:22 | 질서 자동 테스트 1: 한 줄로 인사만 해줘. | chatgpt·claude (gemini 의도적 실패, perplexity TODO) | 2/4 전송 444ms, 격리 확인 |
| 2 | 11:29 | 질서 자동 테스트 2: 마크다운 예시 요청 | chatgpt·claude·gemini | 3/3 전송 388ms, 응답 3개 Markdown으로 저장 확인 |
| 3 | 11:35 | 질서 자동 테스트 3: 첨부 파일의 비밀 단어 | chatgpt·claude·gemini | 3/3 전송 1243ms. **첨부가 실제로는 붙지 않음**(하네스 명령 유실) → 파일 첨부 검증은 미완 |

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

## 사용자 확인 필요
- Grok · Perplexity 로그인 후 셀렉터 실측
- MacBook에 새 dmg 설치, 같은 Supabase 계정 로그인 → 프롬프트 공유 확인
- **파일 첨부 전송 1회** (📎로 작은 txt 첨부 → "첨부 파일 내용 요약해줘") — 세 서비스에 실제 첨부되는지
- 테스트로 생긴 notes 2건·comparisons 3건("질서 자동 테스트 N")은 그대로 두었음. 지워도 됨
- 이후 무인 테스트를 맡길 때는 화면 잠금을 해제해 두거나(시스템 설정 → 잠금 화면 → 화면 보호기 후 잠금 "안 함"), 테스트 후 다시 켜기
