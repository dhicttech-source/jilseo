# 무인 작업 보고서 (출장 기간, 2026-09-10 ~)

> 사용자 부재 중 Claude가 수행한 작업과 결과. 테스트 전송 상한 8회 (사용자 승인).
> 검증 수단: 개발 빌드 전용 테스트 하네스 (`scripts/harness.py` → `dev_commands.json` / `dev_results.json`). dmg에는 포함되지 않음.

## 테스트 전송 사용 내역

| # | 시각 | 내용 | 대상 | 결과 |
|---|---|---|---|---|
| 1 | 11:22 | 질서 자동 테스트 1: 한 줄로 인사만 해줘. | chatgpt·claude (gemini 의도적 실패, perplexity TODO) | 2/4 전송 444ms, 격리 확인 |

## 1. 하네스·메모 보강 (완료)
- 패널 init script가 선택 텍스트를 추적 → "메모" 클릭으로 패널 포커스가 빠져도 직전 선택(60초 이내) 사용
- 검증: ChatGPT 패널 텍스트 21자 프로그램 선택 → 메모 저장 OK / 선택 해제 후 메모 → 폴백으로 저장 OK / 선택 없는 패널 → "선택된 텍스트 없음" OK
- 테스트로 생긴 notes 2건은 작업 종료 시 삭제

## 2. Phase 1 잔여 검증
- 최대화/복귀: 하네스로 chatgpt 최대화 → 스크린샷에서 스테이지 전체 차지 확인, settings.maximized 저장 확인 → 복귀 시 2×2 원상 OK
- 셀렉터 JSON 수정 → 재시작 반영: `~/Library/Application Support/jilseo/services/gemini.json`의 input을 `#없는입력창`으로 → `scripts/dev-restart.sh` → 진단에서 gemini input=false → 테스트 전송 #1에서 gemini만 'input not found', chatgpt·claude 전송 → 원복 → 재시작 → 진단 전부 found. **통과**
- 지시문 §7 완료 기준: dmg 2대 설치 항목 외 4개 모두 충족

## 사용자 확인 필요
- Grok · Perplexity 로그인 후 셀렉터 실측
- MacBook에 새 dmg 설치, 같은 Supabase 계정 로그인 → 프롬프트 공유 확인
