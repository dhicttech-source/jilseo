# Day 1 검증 — Windows (Phase 4)

> macOS의 `day1-verification.md`와 같은 Go/No-Go. 노트북에서 채운다.

| 항목 | 값 |
|---|---|
| 검증일 | |
| 기기 / Windows 버전 | |
| 설치 파일 | Actions 아티팩트 `jilseo-windows-x64` (커밋: ) |
| WebView2 버전 | (앱 설정 화면 또는 edge://version) |

## A. 기본 동작
- [ ] 창 1개에 ChatGPT / Claude / Gemini 패널 3개 표시
- [ ] 창 크기 변경 시 패널이 따라옴
- [ ] 헤더 "진단" → diagnostics.json 생성. 각 패널 input/send found=true
- [ ] 패널 위치가 헤더와 겹치지 않음 (겹치면 인셋 값 기록: 설정 화면 없음 → diagnostics 대신 스크린샷)

## B. 로그인
- [ ] ChatGPT (방식: )
- [ ] Claude (방식: , Google 팝업 열림 여부: )
- [ ] Gemini (방식: , Google 차단 문구: )
- [ ] 패스키(Windows Hello) 동작 여부:

## C. 세션 유지
- [ ] 종료 후 재실행 → ChatGPT 유지
- [ ] 종료 후 재실행 → Claude 유지
- [ ] 종료 후 재실행 → Gemini 유지

## D. 전송
- [ ] 질문 1건 → 3패널 전송됨 (하단 "N/3 전송 · ms": )
- [ ] 응답 완료 배지

## 판정
- [ ] GO — 어댑터 체크리스트 재실행으로 진행
- [ ] Chrome UA 전환 후 재시도 (`force-chrome-ua` 파일)
- [ ] NO-GO — 원인:
