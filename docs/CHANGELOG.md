# CHANGELOG — 질서(jilseo)

## [Unreleased]

### Added (2026-10-19, LibreChat 검토 반영 1~4)
- **임시 전송** 🔒: 전송 바 토글. 켜면 이번 세션의 동시 전송·파이프라인 결과를 클라우드에 저장하지 않는다(채택·수정본 갱신도 생략). 앱을 다시 열면 꺼짐
- **Markdown 내보내기**: 요약 카드와 전송 바에 "Markdown 복사"·"저장". 질문·생성 답변·검증 판정(등급·건수·핵심·채택)·수정본, 또는 동시 전송의 서비스별 응답을 `.md`로. 저장은 앱 데이터 폴더 `exports/`(설정에서 열기)
- **셀렉터 JSON 스키마 검증**(zod): 앱 시작 시 잘못된 `services/*.json`은 제외하고 헤더 "서비스 정의 오류"에 파일·필드·사유 표시. 저장소의 JSON 전부를 vitest가 같은 스키마로 전수 검사
- **CI**(`.github/workflows/ci.yml`): PR·main 푸시마다 타입 검사와 테스트
- 하네스 `set_ephemeral`, `export`

### Changed (2026-10-17)
- 저장소 공개 전환(MIT 라이선스). 기여 안내(`CONTRIBUTING.md`)와 이슈·PR 템플릿 추가, README 영어 요약·면책 문구·Release 다운로드 링크. 내부 사업 문서 3편은 저장소에서 제거
- GitHub Release v0.1.3에 macOS dmg와 Windows 설치 파일 첨부

## [0.1.3] — 2026-10-08

### 요약 (사용자 관점)
- 클라우드 저장소를 사용 중인 Supabase 프로젝트에 통합. 설정에 그 프로젝트의 URL·키를 넣고 기존 계정으로 로그인하면 됨. 테이블은 `jilseo_` 접두어로 분리되고 본인 행만 보임. 무료 프로젝트 유지용 자동 호출은 제거

### Changed (2026-10-08)
- 클라우드 저장소를 별도 Free 프로젝트에서 사용자의 기존 Supabase 프로젝트로 통합. 테이블은 `jilseo_prompts`·`jilseo_notes`·`jilseo_comparisons`(접두어)로 생성(`supabase/schema.sql`), 앱은 논리명 → 실제명 변환 한 곳을 거친다. 오프라인 큐는 논리명을 저장하므로 호환
- Free 일시정지 방지 keepalive(launchd `com.dhict.jilseo.keepalive`, `scripts/keepalive.sh`) 제거
- 설정 화면 안내: URL·키 저장 뒤 그 프로젝트의 기존 계정으로 로그인해야 "로그인됨"이 된다는 설명 추가
- 하네스 `recent_rows`(최근 기록의 기기·시각, 동기화 확인용)

## [0.1.2] — 2026-09-30

### 요약 (사용자 관점)
- Grok 응답 완료 판정 개선: 생성 중 표시를 실측해 반영. 5개 서비스 모두 실측 완료

### Fixed (2026-09-30)
- Grok "생성 중" 셀렉터 실측: `button[aria-label="모델 응답 중지"]` (전송 직후부터 응답 완료(46초)까지 존재, 1회 실측). 이로써 5개 서비스 모두 실측 완료 — 정적 대기 8초 폴백을 쓰는 서비스가 없다. Grok은 생각 중에 응답 요소에 "작업 중 Ns" 텍스트가 먼저 나타나므로, 중지 버튼이 사라진 뒤에만 완료로 보는 규칙이 특히 중요

## [0.1.1] — 2026-09-30

### 요약 (사용자 관점)
- **생성 → 검증 파이프라인 모드**: 전송 바의 "동시 / 생성→검증" 토글. 한 서비스가 답을 만들면, 나머지 서비스들이 그 답을 검증한다. 패널 헤더의 역할 칩(생성/검증/제외)으로 배정하고 워크스테이션에 저장된다.
- **검증 렌즈 8종**: 종합·사실·논리·위험·강점·개선·코드·편향. 검증 패널마다 렌즈를 골라 "무엇을 어떻게 따질지"를 정한다. 모든 렌즈는 같은 판정 블록(등급·지적 건수·핵심 3줄)으로 끝나 앱이 읽는다.
- **검토 프리셋 5종과 깊이**: 보고서·문서 / 아이디어·기획 / 코드 / 빠른 검토 / 결론·추천 검토. 깊이(빠름·표준·심층)로 검증 패널 수와 판정 길이를 정한다.
- **판정 요약 카드**: 파이프라인이 끝나면 패널별 등급·건수·핵심 줄이 카드로 먼저 뜨고, "맞는 지적 / 틀린 지적 / 보류"를 눌러 채택을 남긴다. "생성 원문 크게 보기"로 원문은 그다음에 본다.
- **수정 단계**: 심층 깊이에서는 판정을 생성 서비스에 되돌려 "지적 반영 수정본"을 자동으로 받는다. 다른 깊이에서는 카드 버튼으로 요청한다. 동의하지 않는 지적은 이유를 밝히고 유지하도록 지시한다.
- **성적표**: 헤더 "성적표"에서 렌즈×검증 서비스의 맞는 지적 비율(채택한 판정만), 생성 서비스의 신뢰 비율을 본다. 기록이 쌓이면 프리셋 선택 시 배정을 제안한다(클릭해야 반영, 자동 라우팅 없음).
- **설정**: 검증 렌즈·수정 단계 템플릿 편집과 기본 복원, 사용자 렌즈 추가.
- **안정성**: 검색·도구 호출로 응답이 멈추는 구간을 완료로 오인하던 문제, Gemini 답변이 옛 응답으로 읽히던 문제, Claude 답변이 잘려 읽히던 문제, Gemini 입력 실패(응답 뒤 포커스 상실)를 고쳤다. ChatGPT·Claude·Gemini·Perplexity의 "생성 중" 표시를 실측해 응답 완료 판정이 빨라졌다.
- **알려진 제약**: ChatGPT Free는 검색이 붙는 질문에서 답변이 끊기거나 비는 경우가 있어 생성 서비스로는 Claude·Gemini·Perplexity를 권한다. Grok의 "생성 중" 표시는 미실측(정적 대기 8초).

### 상세 (개발 기록)

### Added — 성적표와 배정 추천 (2026-09-30, 설계 D 단계)
- 헤더 "성적표": Supabase comparisons 최근 500행의 파이프라인 기록을 집계. 렌즈×검증 모델의 맞는 지적 비율(요약 카드에서 채택한 판정만: 맞음 ÷ (맞음+틀림)), 실행 수, 평균 심각 지적 수, 등급 분포; 생성 모델별 신뢰 비율·수정 단계 수. 로그인 필요, 캐시 없음
- 파이프라인 기록에 `responses._meta`(프리셋·깊이·생성·검증 목록·수정 여부) 추가. 메타가 없는 옛 기록도 생성 키를 추론해 집계
- 전송 바 추천: 성적표가 로드돼 있고 프리셋이 선택돼 있으면 슬롯마다 채택 3건 이상 중 최고 정확도 모델을 제안. "성적표 추천 반영" 클릭 시에만 배정. 자동 라우팅은 하지 않는다
- 하네스 `scorecard`; vitest 집계·추천 테스트 9건

### Added — 수정 단계 (2026-09-30, 설계 C 단계)
- 검증 판정을 생성 패널의 같은 대화에 되돌려 "지적 반영 수정본"을 받는다. 심층 깊이에서는 자동(생성 1 + 검증 N + 수정 1), 다른 깊이에서는 요약 카드의 "지적 반영 수정본 요청" 버튼(클릭 1회 = 전송 1회)
- 수정 템플릿(`{verdicts}`): 타당한 지적 반영, 동의하지 않는 지적은 이유를 밝히고 유지, 바뀐 점 요약 후 수정본 전체. 설정에서 편집·기본 복원. 검증자당 4,000자 절단
- 수정본은 같은 비교 기록 행에 `revised:<생성 id>`로 추가 저장. 카드에 수정본 발췌 표시. 하네스 `revise`

### Fixed (2026-09-30, C 단계 실기에서 발견)
- 새 응답 판정을 "요소 수 증가"로 하던 것을 "읽은 요소의 위치(idx)가 기준보다 뒤"로 변경. Gemini는 새 응답 요소가 비어 있는 동안 "비어 있지 않은 마지막 요소"가 옛 응답을 가리켜, 요소 수만 늘어난 시점에 옛 판정을 새 판정으로 읽었다(수정 단계 실기에서 Claude가 "검토자의 지적이 이전 답변에 대한 것"이라고 짚어냄). 이 수정은 전송 승인분이 없어 실기 재검증 전

### Added — 검토 프리셋·깊이·요약 카드 확장 (2026-09-30, 설계 B 단계)
- 프리셋 5종(보고서·문서 / 아이디어·기획 / 코드 / 빠른 검토 / 결론·추천 검토): 전송 바에서 고르면 생성 패널은 유지한 채 검증 슬롯(렌즈 + 선호 서비스 순)대로 역할·렌즈를 배정하고 남는 패널은 제외. 배정 결과를 전송 바에 표시
- 깊이(빠름 1개·5줄 / 표준 3개·15줄 / 심층 전부·제한 없음): 검증 패널 수와 판정 길이 지시. 초과 패널은 프리셋 슬롯 순서로 앞에서 남김
- 요약 카드: 렌즈 순서(강점→사실→논리→위험→개선→코드→편향→종합)로 정렬, 프리셋·깊이·생략 패널 표시, "생성 원문 크게 보기"(판정 먼저, 원문은 그다음)
- 프리셋·깊이는 설정과 워크스테이션에 저장·복원. 하네스 `apply_preset`, `set_depth`; vitest 프리셋 배정·깊이 절단·정렬 테스트

### Fixed (2026-09-30, B 단계 실기에서 발견)
- Gemini `message-content`는 자식이 다른 곳에 투영되어 `innerText`가 비고 크기도 0이지만 `textContent`에 전체 응답이 있다. 응답 읽기가 innerText가 비면 textContent를 쓰도록 변경 (옛 답변을 최신으로 읽던 문제)
- Known: ChatGPT(Free)는 웹 검색이 붙는 질문에 "현재 + 출처 링크"만 출력하고 멈추는 현상이 오늘 3회 반복(페이지 자체가 그렇게 끝남). 검색이 필요한 질문의 생성 패널은 Claude·Gemini·Perplexity를 권장

### Added — 검증 렌즈 라이브러리 (2026-09-30, 설계 `docs/verification-lens-design-2026-09-30.md` A 단계)
- 내장 렌즈 8개(종합·⚪사실·🧠논리·⚫위험·🟡강점·🟢개선·🔧코드 4레이어·🎭편향). 검증 패널마다 렌즈 배정(역할 칩 옆 선택, 권장 서비스 ✓), 워크스테이션에 저장·복원
- 모든 렌즈 끝에 고정 판정 블록(`=== 판정 ===` 등급·심각/보통/경미 건수·핵심 3줄). 앱이 파싱해 비교 기록 `responses._verdicts`에 저장(스키마 변경 없음). 형식을 어기면 "형식 불명"
- 파이프라인 완료 후 요약 카드: 패널별 렌즈·등급·건수·핵심 줄과 "맞는 지적 / 틀린 지적 / 보류" 채택 버튼. 채택은 comparisons 행을 갱신(오프라인이면 큐, `updateOrQueue`)
- 설정 → 검증 렌즈: 렌즈별 템플릿 편집·기본 복원, 사용자 렌즈 추가·삭제. 구 `verifyTemplate` 설정은 종합 렌즈 덮어쓰기로 이전
- 하네스 `set_lens`, `judge`, `last_pipeline`(읽기 전용 명령은 긴 명령 중에도 실행); vitest 파서·렌즈 해석 테스트 14건

### Fixed (2026-09-30)
- 검색·도구 호출로 응답이 몇 초 멈추는 구간을 "응답 완료"로 오인해 잘린 답변을 검증에 넘기던 문제(Claude·Perplexity에서 실측). 서비스 JSON에 `generating` 셀렉터(중지 버튼·스트리밍 속성)를 추가하고, 그 요소가 사라진 뒤에만 완료로 본다. 미실측(TODO)이면 정적 대기 3초 → 8초. 실측 완료: ChatGPT `button[data-testid="stop-button"]`, Claude `div[data-is-streaming="true"]`, Perplexity `button[aria-label^="응답 중지"]`, Gemini `button[aria-label="대답 생성 중지"]`(전송 직후부터 응답 완료까지 존재, 2회 실측·관찰 경로에서 켜짐/꺼짐 확인). Grok만 TODO
- 응답 컨테이너 선택 규칙 변경: 뒤에서부터 텍스트가 비어 있지 않은 첫 요소를 고르고(Gemini는 끝에 빈 `message-content`가 붙어 관찰이 180초 상한까지 늘어짐), 그 요소를 포함하는 가장 바깥 매칭 요소를 쓴다(Claude는 스트리밍 중 내부 조각이 걸려 답변을 1글자로 읽음). 마크다운 변환에서 `.sr-only`(Claude의 "Claude 응답:" 낭독용 제목) 제거
- 개발 하네스: 결과 파일에 최근 20건 `recent` 맵 유지(동시 실행 명령이 결과를 덮어 사라지던 문제), 클라이언트가 앞 명령 소비를 기다린 뒤 명령 파일을 씀(한 칸짜리 명령 파일 덮어쓰기), 관찰 중 "생성 중" 요소 실측 기록(`probes` 명령, 개발 빌드만)

### Known (2026-09-30)
- ChatGPT(Free)가 긴 검증 프롬프트(약 3,000자)에 빈 응답을 돌려주는 경우가 있다(오늘 2회 연속, 화면에 오류 문구 없음). 앱은 180초 대기 후 "형식 불명"으로 기록한다. 계정 한도 또는 서비스 측 문제로 보이며, 검증 렌즈는 Claude·Gemini·Perplexity에 배정하는 것이 안전

### Added — 생성→검증 파이프라인 모드 (2026-09-29)
- 전송 바 "동시 / 생성→검증" 모드 토글. 파이프라인은 생성 패널 1개에 보낸 뒤 응답을 기다려, 검증 패널들에 "질문+답변+검증 템플릿"을 동시 전송 (클릭 1회에 생성 1건 + 검증 N건, 재시도·반복 없음)
- 패널 헤더 역할 칩(생성/검증/제외, 파이프라인 모드에서만 표시). 미지정 시 첫 AI 패널이 생성, 나머지 검증. 워크스테이션에 모드·역할이 함께 저장돼 프리셋 역할
- 설정 → "생성 → 검증 파이프라인": 검증 템플릿 편집(`{question}`, `{answer}`), 기본값 복원. 생성 답변은 20,000자에서 잘라 주입
- 비교 기록은 기존 `comparisons.responses`에 생성은 서비스 id, 검증은 `verify:<id>` 키로 저장 (스키마 변경 없음)
- `src/lib/broadcast.ts`: 전송·응답 수집을 `sendAndCollect`로 분리 (동시 전송과 파이프라인이 공유)
- 하네스 명령 `pipeline`, `set_mode`, `set_role`; vitest 도입(`npm test`) — 역할 해석·템플릿 조립 유닛 테스트

### Fixed (2026-09-29)
- Gemini가 응답을 마친 뒤 포커스를 잃으면 `execCommand`와 paste 이벤트를 모두 무시해 입력이 실패하던 문제 → contenteditable DOM 직접 삽입 폴백(`insertDomJs`, 줄마다 `<p>`). Google 사이트는 Trusted Types로 `innerHTML` 대입을 막으므로 `createElement`/`createTextNode`만 사용

### Phase 4 — Windows 1단계 (2026-09-18)
- GitHub Actions `windows-build`: main push 또는 수동 실행 시 NSIS x64 설치 파일을 아티팩트로 생성
- NSIS 현재 사용자 설치, WebView2 부트스트래퍼 자동, 한국어/영어
- Windows Chrome UA 플래그 파일(`%APPDATA%\jilseo\force-chrome-ua`) — 재빌드 없이 현장 전환
- `docs/windows-first-run.md`(SmartScreen 절차), `docs/day1-verification-windows.md`

### Fixed (2026-09-10 저녁)
- **가려진 창에서 앱이 멈추던 문제**: UI·패널 webview에 `background_throttling(Disabled)` 적용 (macOS 14+). 다른 창에 덮이거나 화면이 잠겨도 전송·응답 관찰이 계속됨
- 개발 감시 스레드의 `url()` 폴링이 페이지 전환 중 panic을 일으켜 앱이 종료되던 문제 제거. `panel_url`은 panic-safe
- 전송 버튼이 비활성(파일 업로드 중)일 때 Enter 폴백으로 넘어가 전송이 누락되던 문제 → 최대 12초 활성화 대기
- 메모/워크스테이션이 쓰는 `panel_url`이 페이지 전환 중 앱을 죽일 수 있던 문제

### Added
- UI 크기 설정(100/115/130/150%, 기본 130%). 헤더·패널 헤더·독·입력창 글씨와 버튼 확대. 온보딩·설치 안내 문구 갱신(가려져도 동작, 파일 후 새 채팅)
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
