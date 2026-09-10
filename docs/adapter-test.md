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
- 결과 (2026-09-10 첫 Broadcast "오늘 날씨"): [x] 2 [x] 3 [x] 4 (응답 719자 수집) [ ] 5 [ ] 6 [ ] 7 [x] 8 [x] 9

### Claude (`claude.json`)
- 실측일: 2026-09-10 (input `[data-testid="chat-input"]`, send `button[data-testid="chat-input-send"]`)
- 특이: 사이드바 버튼 70여 개. 전송 버튼은 `data-testid`로만 식별. 응답 텍스트에 "웹 검색됨, 도구 사용함" 칩이 섞임
- 결과 (2026-09-10): [x] 2 [x] 3 [x] 4 (응답 215자 수집) [ ] 5 [ ] 6 [ ] 7 [x] 8 [x] 9

### Gemini (`gemini.json`)
- 실측일: 2026-09-10 (input `div.ql-editor[role="textbox"]`, send `button.send-button` 폴백 `aria-label="메시지 보내기"`)
- 특이: Quill 에디터. aria-label이 언어 의존적이라 class 우선. 파일 input 없음(업로드 메뉴 경유, Phase 3 과제). response는 `message-content` 하나로 확정
- 결과 (2026-09-10): [x] 2 [x] 3 [x] 4 (응답 422자 수집) [ ] 5 [ ] 6 [ ] 7 [x] 8 [x] 9

### Grok (`grok.json`) — TODO(selector)
- 로그인 후 실측 필요. 독 칩에 노란 점으로 표시됨.

### Perplexity (`perplexity.json`) — TODO(selector)
- 로그인 후 실측 필요. 독 칩에 노란 점으로 표시됨.
- 2026-09-10 스테이지에 올린 채 Broadcast → 이 패널만 실패, 나머지 3개 정상 → **실패 격리 확인**

## 지시문 §7 완료 기준 현황 (2026-09-10)

- [ ] 두 맥에서 동일 dmg 설치, 각각 로그인 유지 — Day 4~5
- [x] 질문 1건 입력 → 스테이지 패널 모두 전송 (ChatGPT·Claude·Gemini 전송·응답 완료. 소요 ms는 다음 테스트에서 기록)
- [x] 패널 하나 어댑터 실패 시 나머지 정상 동작 (Perplexity TODO 셀렉터로 확인)
- [ ] 셀렉터 JSON 수정 후 앱 재시작만으로 반영 — 메커니즘 구현됨, 항목 5·6 테스트 대기
- [x] 앱 종료 → 재시작 시 마지막 패널 구성 복원 (2열·4패널 복원 확인)

## 셀렉터 실측 방법 (개발자용)

앱 UI webview에서 `evalInPanel(id, probeJs(selectors))`로 현재 JSON 셀렉터의 존재·가시성을 확인할 수 있다.
새 셀렉터를 찾을 때는 `src/inject/runtime.ts`의 스크립트 패턴처럼 `document.querySelectorAll('button[aria-label], [data-testid]')`를 텍스트 삽입 후에 조회한다 (전송 버튼은 입력이 있어야 DOM에 나타남).
