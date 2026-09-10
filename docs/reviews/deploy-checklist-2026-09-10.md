# 🔍 바이브코딩 완성본 배포 이전 체크리스트 결과 — jilseo (2026-09-10)

> 대상: macOS 개인용 Tauri 데스크톱 앱. 서버·결제·회원가입이 없으므로 웹 서비스 전용 항목은 "해당 없음(N/A)"으로 표기하고 이유를 적는다.

### ✅ 1. API 키 / 비밀번호 하드코딩
**발견:** 소스·Git 전체 이력에 실제 키 없음 (`sb_publishable_`·`eyJ` 검색 결과는 설정 화면 라벨 문구뿐). Supabase 키는 사용자가 설정 화면에서 입력해 `settings.json`(앱 데이터 폴더)에 저장. `.env`·`.env.*`·`release/`는 `.gitignore`. `keepalive.env`도 앱 데이터 폴더(권한 600).
**참고:** publishable(anon) 키는 공개용 키라 RLS가 보호. Secret key는 앱이 받지 않도록 설정 화면에 경고.

### ✅ 2. OWASP
**발견:** DB 접근은 supabase-js 파라미터 API만 사용(문자열 SQL 없음). 원격 서비스 패널에는 Tauri IPC 권한을 주지 않음(capability `webviews: ["ui"]`) → 사이트 스크립트가 앱 명령을 호출할 수 없음. 팝업은 https만 허용.

### 🟡 3. 인증 로직
**발견:** 로그인은 Supabase Auth(이메일+비밀번호, 해싱·만료는 Supabase가 처리). 세션 토큰은 `session.json`에 평문 저장.
**쉬운 설명:** 집 열쇠를 서랍에 넣어둔 셈. 같은 맥 사용자 계정 안에서는 읽힘.
**수정 방법:** 개인 1인용이라 허용 범위. 공유 맥이라면 macOS Keychain 저장으로 바꿀 것(Tauri `stronghold`/`keyring` 플러그인). 지금은 유지.

### ✅ 4. 입력값 검증
**발견:** 파일 첨부 8MB 상한(UI·Rust 양쪽). 웹슬롯 URL은 `new URL()` 파싱 후 https 보정. `innerHTML` 사용 1곳(시작 오류 표시)은 이번에 `textContent`로 교체.

### ✅ 5. 권한 체크
**발견:** `supabase/schema.sql` 3개 테이블 모두 RLS `auth.uid() = user_id` (읽기·쓰기). 앱 저장 경로는 `saveRow()` 한 곳으로 통일되어 user_id 부여 누락 위험 제거.

### N/A 6. CORS — 서버 없음. Supabase는 anon 키 + RLS로 통제.
### ✅ 7. HTTPS — 모든 서비스·Supabase 통신 https. 앱 UI는 로컬 번들(tauri://). 팝업도 https만 허용.
### 🟡 8. Rate Limiting
**발견:** 앱이 자동 반복 전송을 하지 않음(지시문 §8 준수, 300ms 지터). Supabase 로그인 시도 제한은 Supabase 기본값.
**수정 방법:** 별도 조치 불필요. 다만 "Allow new users to sign up" 끄기(대시보드)는 사용자 확인 필요 🔍.

### ✅ 9. 배포 전 설정
**발견:** 테스트 하네스·감시 스레드는 `import.meta.env.DEV` / `cfg(debug_assertions)`로 릴리스 빌드에서 제외. dmg에는 포함되지 않음. 디버그 플래그·기본 계정 없음.

### N/A 10. 로드밸런싱 — 서버 없음.
### 🔍 11. 백업
**발견:** Supabase Free는 자동 백업(PITR) 없음. 프롬프트·메모·비교 기록은 로컬 캐시(`prompts_cache.json`)에도 일부 남지만 완전하지 않음.
**확인 방법:** 대시보드 Database → Backups에서 수동 백업 주기 확인. 또는 월 1회 Table Editor → Export CSV.

### 🟡 12. 모니터링
**발견:** 데스크톱 앱이라 서버 모니터링 대상 없음. keepalive 로그(`keepalive.log`)에 일일 REST 결과만 기록.
**수정 방법:** keepalive가 200이 아닐 때 알림이 없음. 필요하면 스크립트에 `osascript -e 'display notification'` 한 줄 추가.

### ✅ 13. 비용
**발견:** 유료 API 호출 0건(지시문 §1 "API 비용 0"). Supabase Free. 재시도는 `flushQueue` 1회 순회로 무한 재시도 없음. 하네스 테스트 전송은 사용자 승인 상한(8회) 안에서 3회 사용.

### ✅ 14. 환경 분리 — `.env.example`만 추적, 실제 값은 앱 설정 화면. dev/release는 Tauri 프로파일로 구분.

### 🟡 15. 개인정보
**발견:** 저장 데이터는 사용자 본인의 프롬프트·메모·AI 응답. 타인 정보 수집 없음. 단 비교 기록에 AI 응답 원문이 저장되고 메모는 패널의 임의 선택 텍스트라, 사용자가 개인정보를 붙여 넣으면 Supabase(서울 리전)에 그대로 저장됨.
**수정 방법:** 개인용이라 동의 절차는 불필요. 온보딩에 "저장 위치: Supabase 서울" 한 줄 안내 권장(다음 수정 시).

### ✅ 16. 페이지네이션
**발견:** 프롬프트 목록은 전체 조회(`select ... order`)이나 개인 라이브러리 규모(수백 건 이하)라 무해. 인덱스 3개 생성(`prompts_user_folder_idx` 등).

### ✅ 17. 동시성 — 결제·재고 없음. 큐 파일 쓰기는 Rust에서 임시파일+rename(원자적).
### ✅ 18. 타임존 — 모든 `created_at`을 ISO 8601 UTC(`toISOString`)로 저장, DB 컬럼 `timestamptz`.

### ✅ 19. 미구현 함수 참조 — `tsc --noEmit`·`cargo check` 통과. Rust 커맨드 등록 목록과 프론트 `invoke` 이름 대조 완료.
### ✅ 20. 패키지 실존 — zustand, @supabase/supabase-js 2.116, turndown 7.2.4, @tauri-apps/*, tailwindcss, base64(crate) 모두 설치·빌드 성공.

### 🟡 21. 에러 핸들링
**발견:** 패널별 try/catch로 실패 격리. 전역 `error`/`unhandledrejection` 핸들러가 빈 화면 대신 오류를 표시. Supabase 호출에는 명시적 타임아웃 없음(supabase-js fetch 기본).
**수정 방법:** 오프라인이면 큐로 빠지므로 무한 대기는 아님. 추후 `AbortSignal.timeout(10000)`을 `createClient`의 `global.fetch`에 주입하면 더 안전.

### ✅ 22. 의존성 취약점 — `npm audit` 0건. 🔍 `cargo audit`는 미설치(설치: `cargo install cargo-audit` 후 `src-tauri`에서 실행).

### ✅ 23. 로그 민감정보 — 앱 로그는 vite 콘솔뿐, 키·토큰 출력 없음. keepalive.log는 HTTP 코드만. `dev_results.json`(개발 전용)에 응답 텍스트가 남지만 릴리스에는 없음.

### 🟡 24. 외부 장애 대응
**발견:** 패널 JS 실행 5~15초 타임아웃, 응답 관찰 최대 180초, 저장 실패 시 큐 적재 후 재시도. Supabase 장애 시 앱은 로컬로 계속 동작.
**수정 방법:** 21번과 동일(fetch 타임아웃).

### ✅ 25. Git 이력 — 비밀키 없음. `.gitignore` 최초 커밋부터 적용.

### N/A 26. CSRF — 브라우저 세션 기반 서버 API 없음.
### N/A 27. 보안 헤더 — 웹 서버 없음. 앱 CSP는 `null`(로컬 UI). 🟡 원격 패널이 아닌 UI webview에만 적용되므로 위험 낮음. Phase 4 전 CSP 지정 검토.
### ✅ 28. OAuth — 앱이 OAuth를 직접 구현하지 않음. 각 서비스 사이트가 팝업으로 처리.
### ✅ 29. 롤백 — 이전 dmg를 `release/`에 보관하면 재설치로 복귀. 데이터는 앱 데이터 폴더에 있어 재설치 영향 없음.
### N/A 30. CDN — 해당 없음.
### N/A 31. 이용약관 — 개인용.
### ✅ 32. 스키마 마이그레이션 — `schema.sql`은 `if not exists`·`drop policy if exists`로 재실행 안전. 컬럼 삭제 없음.
### ✅ 33. null/undefined — API 응답은 `?.`·`??`로 접근(`results[a.id]?.ok`, `settings?.stage ?? DEFAULT`). 셀렉터 미존재 시 `{ok:false, reason}` 반환.
### N/A 34. Next.js 혼용 — Next.js 아님.
### N/A 35. SEO — 데스크톱 앱.
### 🟡 36. 호환성 — macOS 14+ 명시(`minimumSystemVersion`). Apple Silicon dmg만 빌드(`aarch64`). 🔍 Intel 맥이 필요하면 `--target x86_64-apple-darwin` 추가 빌드.

---
## 📋 최종 요약
🔴 즉시 수정 (배포 금지): 0건
🟡 권장 수정: 7건 (3, 8, 12, 15, 21, 24, 36)
🔍 코드 외 별도 확인 필요: 3건 (11 백업, 22 cargo audit, 8/사용자 가입 차단)
✅ 이상 없음: 17건 / N/A: 9건

## 🚀 수정 우선순위
1순위: Supabase 가입 차단 + 수동 백업 주기 확인 (11·8) — 데이터는 클라우드에만 온전히 있음
2순위: supabase-js fetch 타임아웃 주입 (21·24) — 네트워크 불안정 시 UI 대기 방지
3순위: 온보딩에 저장 위치 안내 (15), 세션 파일의 Keychain 이전은 공유 맥일 때만 (3)
