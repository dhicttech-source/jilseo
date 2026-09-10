# Intent Review — 2026-09-10

## 요약
- 스캔: 5개 파일(adapters/index.ts, lib/broadcast.ts, store/stage.ts, lib/supabase.ts, src-tauri/webviews.rs), 34개 함수
- 후보: 9건 (high 3 / medium 5 / low 1)
- 최대 이슈: `runBroadcast()`가 전송·응답 관찰·마크다운 변환·비교 기록 저장·큐 플러시·첨부 해제를 한 함수에서 수행 (⭐⭐)

## 🔴 High Priority

### 1. `runBroadcast()` — ⭐⭐ — src/lib/broadcast.ts:27
**실제 책임**: 대상 선정 → 스냅샷 → 전송 → 응답 관찰 → HTML→MD → comparisons 저장 → 큐 플러시 → 첨부 스토어 초기화
**문제**: 이름은 "전송"인데 저장·변환·전역 스토어 변경까지 수행. 65줄. 비교 기록 저장 규칙(user_id·created_at·device)이 여기 인라인.
**추출 제안**: `collectResponses(adapters, baselines)` + `saveComparison(prompt, responses)` 로 분리. (이번 적용: `saveComparison`은 supabase.ts의 `saveRow()`로 통합)

### 2. 분산된 의도: "클라우드 행 저장 시 user_id·created_at 부여" — 3곳
- src/lib/broadcast.ts:74, src/lib/notes.ts:26, src/store/library.ts:60
- 각자 `...(user ? { user_id: user.id } : {})` + `created_at: new Date().toISOString()` 를 인라인 구현
- 위험: RLS 정책 변경이나 컬럼 추가 시 한 곳만 고치면 나머지는 큐로 빠짐
- **적용**: `saveRow(table, row)` (supabase.ts) — cfg·user 주입·created_at 기본값을 한 곳에서. 3곳 교체

### 3. 분산된 의도: "열 수는 1~4" — 3곳 (stage.ts:147, 191, 234)
- `Math.min(4, Math.max(1, n))` 반복. 상한을 바꾸면 세 군데 수정 필요
- **적용**: `clampColumns(n)` 추출, `MAX_COLUMNS` 상수

## 🟡 Medium / 🟢 Low

| 파일:라인 | 함수명 | 별점 | 실제 책임 | 추출 가치 | 조치 |
|---|---|---|---|---|---|
| stage.ts:135,168,180 | (인라인) `[...baseServices, ...webSlots.map(webSlotToService)]` | – | 서비스 목록 합성 규칙 3회 반복 | medium | **적용** `composeServices()` |
| stage.ts:137,190 | (인라인) `stage.filter(known).slice(0, MAX_PANELS)` | – | 스테이지 정합성 규칙 2회 | medium | **적용** `sanitizeStage()` |
| stage.ts:156 | `addWebSlot()` | ⭐⭐⭐ | 웹슬롯 등록 **+ 스테이지에 올림** | medium | 이름에 없는 부수효과. 문서화(주석)로 갈음, Phase 4에서 `addWebSlotToStage`로 개명 검토 |
| adapters:164 | `broadcastText()` | ⭐⭐⭐ | 텍스트 전송 **+ 파일 첨부** | medium | 첨부 매개변수를 이름이 드러내지 않음. `broadcastMessage`로 개명 후보 |
| broadcast.ts:95 | `runBroadcastAndWaitSent()` | ⭐⭐⭐ | outcome 필드를 폴링해 전송 완료 대기 | medium | `outcome.sent`를 Promise로 노출하면 폴링 제거 가능 |
| runtime.ts:probeJs / stage.ts:53 | `TODO` 센티널 문자열 | – | "미실측 셀렉터" 규칙이 JS 문자열과 TS 양쪽에 리터럴로 존재 | medium | **적용** `TODO_SELECTOR_PREFIX` 상수로 통일 |
| webviews.rs:120 | `create_panel()` | ⭐⭐⭐⭐ | 없으면 생성, 있으면 기존 반환(멱등) | low | `ensure_panel`이 더 정확하나 IPC 이름 변경 비용 > 이득. 주석 보강 |
| webviews.rs:255 | `spawn_dev_watch()` | ⭐⭐⭐ | URL 기록 + 리로드 플래그 처리 | low | 개발 전용, 유지 |

## 패턴 분석
- **분산된 의도**: 2건 (클라우드 행 저장 규칙, 열 수 클램프) → 이번에 통합
- **표면적 중복**: `insertOrQueue`/`deleteOrQueue`의 "시도 후 큐" 골격 (supabase.ts:89,103) — 2회라 유지
- **새 모듈 후보**: 응답 수집(`collectResponses`)과 비교 기록 저장을 `src/lib/comparison.ts`로 분리하면 broadcast.ts가 전송 오케스트레이션만 남음

## 아키텍처 제안
1. `runBroadcast`를 "전송" / "응답 수집·저장" 두 단계로 나누고, 하네스·UI는 두 Promise(`sent`, `completion`)를 받는다.
2. 셀렉터 상태(실측/TODO/웹슬롯)를 `ServiceDef.kind`와 `selectorStatus`로 명시해 문자열 센티널을 없앤다.
3. 클라우드 저장은 `saveRow`/`deleteRow` 두 진입점만 남기고 스토어들은 이를 호출한다 (이번 적용으로 시작).

## 다음 단계 권장
분산된 의도 2건, ⭐ 함수 0건 → `/architecture-review` 조건 미충족. 생략.
