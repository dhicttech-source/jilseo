# 질서 疾書 (jilseo)

여러 AI 웹 서비스(ChatGPT · Claude · Gemini · Grok · Perplexity)를 한 창의 패널로 띄우고, 프롬프트 하나를 동시에 보내거나 **생성 → 검증 파이프라인**으로 돌리는 개인용 macOS/Windows 데스크톱 앱입니다. API를 쓰지 않고 각 서비스의 웹 화면에 직접 입력합니다(계정·로그인은 서비스 웹뷰가 관리).

> **English**: jilseo is a personal desktop app (Tauri 2) that opens several AI web services side by side, broadcasts one prompt to all of them, or runs a *generate → verify* pipeline: one service answers, the others critique it through "verification lenses" (fact, logic, risk, …), and a scorecard tracks which service catches real issues. No API keys: it types into each service's own web UI, so your existing subscriptions apply. Downloads are on the [Releases](https://github.com/dhicttech-source/jilseo/releases) page; see [CONTRIBUTING.md](CONTRIBUTING.md) to help.

**다운로드**: [Releases](https://github.com/dhicttech-source/jilseo/releases) — macOS(Apple Silicon) dmg, Windows x64 설치 파일.

## 할 수 있는 것

- **동시 전송**: 스테이지의 모든 AI 패널에 같은 프롬프트(+파일 1개)를 보내고 응답을 마크다운으로 모아 비교 기록으로 저장
- **생성 → 검증 파이프라인**: 한 서비스가 답을 만들면 나머지가 검증. 패널마다 역할(생성/검증/제외)과 **검증 렌즈**(사실·논리·위험·강점·개선·코드·편향·종합)를 배정
- **검토 프리셋·깊이**: 보고서 / 기획 / 코드 / 빠른 검토 / 결론 검토 프리셋, 빠름·표준·심층 깊이
- **판정 요약 카드**: 등급·지적 건수·핵심 줄을 먼저 보고, 맞는 지적/틀린 지적을 채택. 심층에서는 지적을 반영한 **수정본**까지 자동 수신
- **성적표**: 렌즈×서비스의 맞는 지적 비율, 생성 서비스 신뢰 비율. 기록이 쌓이면 배정을 제안(자동 라우팅 없음)
- **프롬프트 변수·접두어·전송 카운터**: 라이브러리의 `{{변수}}`를 삽입 시 채움, 워크스테이션별 프롬프트 접두어, 서비스별 오늘 전송 횟수와 한도 경고
- **내보내기·임시 전송**: 비교 기록을 Markdown으로 복사·저장(Obsidian 등으로), 민감한 프롬프트는 🔒 임시 전송으로 기록을 남기지 않음
- 워크스테이션(패널 구성·대화 URL·역할·렌즈 저장), 프롬프트 라이브러리, 메모, 웹슬롯, Supabase로 두 기기 간 동기화(기존 프로젝트에 `jilseo_` 접두어 테이블, `supabase/schema.sql`)

## 설치

- macOS(Apple Silicon): `release/jilseo_<버전>_aarch64.dmg`. macOS 15 이상은 dmg 안의 "처음 실행하는 법.txt" 참고
  (`xattr -cr /Applications/jilseo.app` 또는 시스템 설정 → 개인정보 보호 및 보안 → "그래도 열기")
- Windows: GitHub Actions `windows-build` 아티팩트의 NSIS 설치 파일. `docs/windows-first-run.md`

## 개발

```bash
npm install
npm run tauri dev     # 개발 실행 (파일 하네스 scripts/harness.py 사용 가능)
npm test              # vitest 유닛 테스트
npm run dmg           # 릴리스 빌드 + 안내문 동봉 dmg
```

Rust(rustup)와 Xcode Command Line Tools가 필요합니다. 서비스별 DOM 셀렉터는 `services/*.json`이며, 앱 데이터 폴더(`~/Library/Application Support/jilseo/services/`)의 복사본을 고치면 재시작 시 반영됩니다.

## 기여

버그 제보, 셀렉터 실측 보고, 렌즈·프리셋 제안, PR 모두 환영합니다. 방법과 원칙은 [CONTRIBUTING.md](CONTRIBUTING.md)에 있습니다. 핵심 원칙은 세 가지입니다: API를 쓰지 않는다, 자동 반복 전송을 만들지 않는다, 셀렉터는 실측값만 기입한다.

## 알아 둘 것

- 개인 용도 도구입니다. 각 AI 서비스의 이용약관은 사용자가 확인하세요. 서비스 UI가 바뀌면 `services/*.json`의 셀렉터를 다시 실측해야 합니다.
- 일부 서비스(특히 무료 플랜)는 긴 프롬프트나 검색이 붙는 질문에서 응답이 비거나 끊길 수 있습니다. `docs/CHANGELOG.md`의 "알려진 제약"을 보세요.
- 라이선스: [MIT](LICENSE)

## 문서

- 원본 지시문: `docs/JILSEO-DIRECTIVE.md` · 개발 계획과 진행 상태: `docs/PLAN.md`
- 변경 기록: `docs/CHANGELOG.md`
- 검증 렌즈 설계: `docs/verification-lens-design-2026-09-30.md`
- 검증 기록: `docs/day1-verification.md`, `docs/adapter-test.md`, `docs/unattended-report.md`
