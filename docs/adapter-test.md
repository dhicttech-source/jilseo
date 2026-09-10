# 어댑터 수동 테스트 체크리스트

> 서비스 사이트가 개편되면 셀렉터가 깨질 수 있다. 이 체크리스트를 어댑터별로 돌려 실패 격리와 JSON 외부화가 동작하는지 확인한다.
> 셀렉터 파일: `~/Library/Application Support/jilseo/services/<id>.json` (앱 헤더의 "셀렉터 JSON 폴더" 버튼으로 열기)

## 공통 절차 (어댑터 1개당)

| # | 항목 | 방법 | 통과 기준 |
|---|---|---|---|
| 1 | 로그인 유지 | 앱 재시작 | 로그인 화면 없이 대화 화면 |
| 2 | 입력 삽입 | Broadcast 바에 짧은 문장 → 보내기 | 패널 입력창에 문장이 보임 (상태 "입력 중") |
| 3 | 전송 | 위와 동시 | 상태 "전송됨", 패널에 사용자 메시지 버블 생성. 5초 이내 |
| 4 | 응답 관찰 | 응답 완료까지 대기 | 상태 "응답 중" → 3초 정적 후 "응답 완료" |
| 5 | 실패 격리 | JSON의 `input` 셀렉터를 일부러 틀리게 수정 → 재시작 → 보내기 | 해당 패널만 "실패 · input not found", 나머지는 "전송됨" |
| 6 | JSON 반영 | 5번 원복 → 재시작 | 재빌드 없이 정상 복귀 |
| 7 | 최대화/복귀 | 헤더 ⤢ / ⤡ | 패널이 스테이지 전체를 차지했다가 복귀 |
| 8 | 독 토글 | 독 칩 클릭 | 패널이 사라지고(숨김) 다시 켜면 대화가 그대로 |
| 9 | 구성 복원 | 패널 구성·열 수 변경 후 재시작 | 마지막 구성 그대로 |

## 어댑터별 기록

### ChatGPT (`chatgpt.json`)
- 실측일: 2026-09-10 (input `#prompt-textarea`, send `button[data-testid="send-button"]`)
- 특이: 입력이 비어 있으면 전송 버튼 대신 음성 버튼이 있음 → 삽입 후 버튼 조회 필요 (런타임이 처리)
- 결과 (2026-09-10): [x] 2 [x] 3 [x] 4 (응답 719자 수집) [x] 5 [x] 6 [x] 7 [x] 8 [x] 9
- 파일 첨부 (2026-09-10 테스트 4·6): 파일 칩까지 붙고 전송되나 응답이 빈 자리표시자로 남고, 그 대화방에서는 이후 텍스트도 응답 없음. 새 채팅에서는 정상(테스트 10) → 무료 플랜의 파일 첨부 제한으로 판단. 파일 Broadcast 후 ChatGPT는 새 채팅으로 이동해 사용

### Claude (`claude.json`)
- 실측일: 2026-09-10 (input `[data-testid="chat-input"]`, send `button[data-testid="chat-input-send"]`)
- 특이: 사이드바 버튼 70여 개. 전송 버튼은 `data-testid`로만 식별. 응답 텍스트에 "웹 검색됨, 도구 사용함" 칩이 섞임
- 결과 (2026-09-10): [x] 2 [x] 3 [x] 4 (응답 215자 수집) [x] 5 [x] 6 [x] 7 [x] 8 [x] 9
- 파일 첨부 (2026-09-10 테스트 4·6): `input[data-testid=file-upload]`에 files 설정, 비밀 단어 정답 → **통과**

### Gemini (`gemini.json`)
- 실측일: 2026-09-10 (input `div.ql-editor[role="textbox"]`, send `button.send-button` 폴백 `aria-label="메시지 보내기"`)
- 특이: Quill 에디터. aria-label이 언어 의존적이라 class 우선. 파일 input 없음(업로드 메뉴 경유, Phase 3 과제). response는 `message-content` 하나로 확정
- 결과 (2026-09-10): [x] 2 [x] 3 [x] 4 (응답 422자 수집) [x] 5 (input="#없는입력창"으로 깨뜨림 → 이 패널만 'input not found', 나머지 2/4 전송 444ms) [x] 6 (원복 재시작 → 진단 전부 found) [x] 7 [x] 8 [x] 9
- 파일 첨부 (2026-09-10 테스트 6): 업로드 메뉴 → hidden-file-input 경로로 첨부, 비밀 단어 정답 → **통과**

### Grok (`grok.json`)
- 실측일: 2026-09-10 (input `div.tiptap[contenteditable]`, send `button[data-testid="chat-submit"]`, fileInput `input[type=file]`)
- 특이: 최초 접속 시 "나이를 확인해 주세요" 모달이 전송을 막음 → 패널에서 1회 처리(2026-09-10 사용자 처리 완료). `button.click()`이 무시될 수 있어 어댑터가 입력창 비워짐으로 전송을 판정하고 requestSubmit→Enter 폴백. response `div[data-testid="assistant-message"]`
- 결과 (2026-09-10 테스트 9): [x] 2 [x] 3 [x] 4 (토큰 정답 수집) [ ] 5 [ ] 6 [x] 7 [x] 8 [x] 9

### Perplexity (`perplexity.json`)
- 실측일: 2026-09-10 (input `#ask-input` — execCommand 무시, paste 이벤트로 삽입; send `button[aria-label="제출"]`; fileInput `input[type=file]`; fileMenu "파일 또는 도구 추가")
- 특이: Lexical 계열 에디터. 삽입 반영이 비동기라 어댑터가 700ms 뒤 readback으로 확인. aria-label이 언어 의존적(영문 UI면 "Submit")
- 결과 (2026-09-10 테스트 7): [x] 2 [x] 3 [x] 4 (토큰 정답 수집) [ ] 5 [ ] 6 [x] 7 [x] 8 [x] 9
- 셀렉터 미실측 상태였던 오전에는 이 패널만 실패, 나머지 정상 → **실패 격리 확인**

## 지시문 §7 완료 기준 현황 (2026-09-10)

- [ ] 두 맥에서 동일 dmg 설치, 각각 로그인 유지 — Day 4~5
- [x] 질문 1건 입력 → 스테이지 패널 모두 전송 5초 내 (실측 548ms / 444ms)
- [x] 패널 하나 어댑터 실패 시 나머지 정상 동작 (Perplexity TODO 셀렉터로 확인)
- [x] 셀렉터 JSON 수정 후 앱 재시작만으로 반영 (2026-09-10 무인 테스트, gemini.json 깨뜨림/원복)
- [x] 앱 종료 → 재시작 시 마지막 패널 구성 복원 (2열·4패널 복원 확인)

## 셀렉터 실측 방법 (개발자용)

앱 UI webview에서 `evalInPanel(id, probeJs(selectors))`로 현재 JSON 셀렉터의 존재·가시성을 확인할 수 있다.
새 셀렉터를 찾을 때는 `src/inject/runtime.ts`의 스크립트 패턴처럼 `document.querySelectorAll('button[aria-label], [data-testid]')`를 텍스트 삽입 후에 조회한다 (전송 버튼은 입력이 있어야 DOM에 나타남).
