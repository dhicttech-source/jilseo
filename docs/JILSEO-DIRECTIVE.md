# 질서(疾書) — Multi-AI Broadcast Desktop App

> Claude Code 작업 지시문. macOS 전용 개인 도구. dmg 배포.
> 참조 서비스: Omni AI Workspace (rrllab.com/ko/workspace) — 기능 범위의 벤치마크.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 서비스명 | 질서(疾書) / 코드명 `jilseo` |
| 명명 유래 | 다산 정약용의 질서(疾書) — 떠오르는 생각을 빠르게 적어두는 방식. 여러 AI의 답을 즉시 받아 적는다는 의미 |
| 목적 | 질문 하나를 여러 AI 웹서비스(구독 계정 그대로)에 동시 전송하고 답변을 나란히 비교·저장 |
| 사용자 | 개인 1인 (Mac Studio M4 Max, MacBook 병행) |
| 배포 | `.dmg` (App Store·공증 불필요, ad-hoc 서명) |
| API 비용 | 0 — 각 서비스 웹 UI에 DOM 주입 방식. API 호출 금지 |

---

## 2. 기술 스택

| 계층 | 선택 | 비고 |
|---|---|---|
| 앱 프레임워크 | **Tauri 2** | macOS WKWebView 사용 → Google 로그인·Cloudflare 통과율 높음 |
| 프론트 | React + TypeScript + Vite | Tailwind. 브랜드 토큰은 JAXIS와 별개, 다크 기본 |
| 백엔드 (Rust) | 창·webview 관리, 세션 저장, 파일 주입 브리지만 담당 | 비즈니스 로직은 프론트에 |
| 로컬 저장 | `~/Library/Application Support/jilseo/` JSON | 워크스테이션·프리셋·세션 |
| 클라우드 저장 | Supabase (Free 조직, 별도 프로젝트) | 프롬프트 라이브러리·메모·비교 기록. 두 맥 간 공유 |
| 패키징 | `tauri build` → dmg | CI 없음. 로컬 빌드 후 두 맥에 복사 |

**Tauri 2 multiwebview 기능이 불안정해 막히면 Electron(WebContentsView)으로 전환한다. 이 경우 프론트 코드는 그대로 재사용하고 Rust 브리지만 Node로 옮긴다. Day 1 검증 항목 참조.**

---

## 3. 기능 범위

### Phase 1 — 핵심 (필수)
- **Broadcast (텍스트)**: 하단 중앙 입력창 → 선택된 모든 패널에 동시 전송
- **패널 그리드**: 창 안에 webview N개 좌우 배치. 기본 3열, 최대 8개
- **독(Dock)**: 하단 바에 등록된 서비스 칩. 클릭으로 스테이지에 올리기/내리기
- **슬롯 최대화**: 패널 하나를 전체 폭으로 확대/복귀 토글
- **서비스 정의 5종**: ChatGPT, Claude, Gemini, Grok, Perplexity (셀렉터 외부 JSON으로 분리)
- **세션 유지**: 서비스별 별도 파티션, 앱 재시작 후 로그인 유지

### Phase 2 — 작업 맥락
- **워크스테이션**: 패널 구성 + 각 패널의 현재 대화 URL 저장/복원. 프로젝트별 여러 개, 빠른 전환
- **프롬프트 라이브러리**: 폴더별 정리, 클릭 시 입력창에 삽입. Supabase 동기화
- **메모**: 패널 내 선택 텍스트 → 메모로 저장. 원본 서비스·URL·시각 자동 기록
- **비교 기록**: Broadcast 1회 = 1 레코드. 각 패널 응답 텍스트를 수집해 Supabase 저장

### Phase 3 — 확장
- **파일 Broadcast**: 파일 1개를 모든 패널에 동시 첨부
- **웹슬롯**: AI 외 일반 URL을 패널로 추가
- **즐겨찾기**: 웹슬롯용 URL 저장
- **응답 마크다운 변환**: 렌더링 HTML → Markdown (turndown) 후 저장. 향후 KMS 인제스트 대비

---

## 4. 아키텍처

```
┌─ Tauri Window ────────────────────────────────────────┐
│  ┌ Panel 1 ┐ ┌ Panel 2 ┐ ┌ Panel 3 ┐                  │
│  │ webview │ │ webview │ │ webview │   (WKWebView×N)  │
│  │ chatgpt │ │ claude  │ │ gemini  │                  │
│  └─────────┘ └─────────┘ └─────────┘                  │
│  ┌ Dock ──────────────────────────────────────────┐   │
│  │ [ChatGPT][Claude][Gemini][Grok][Perplexity]    │   │
│  └────────────────────────────────────────────────┘   │
│  ┌ Broadcast Bar (React) ─────────────────────────┐   │
│  │ [📎][📚 프롬프트]  모든 모델에게 메시지 보내기 ▶ │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
         │ Tauri IPC
         ▼
  Rust: webview 생성/파괴/배치, 세션 파티션, init script 주입, 파일 브리지
         │
         ▼
  각 webview에 inject.js (서비스별 어댑터) → 입력창 삽입 · 전송 클릭 · 응답 관찰
```

### 서비스 어댑터 인터페이스 (`services/*.json` + `adapters/*.ts`)
```ts
interface ServiceAdapter {
  id: string;                 // "chatgpt"
  name: string;               // "ChatGPT"
  url: string;                // "https://chatgpt.com"
  partition: string;          // "persist:chatgpt"
  selectors: {
    input: string;            // 입력창 (contenteditable 대부분)
    send: string;             // 전송 버튼
    response: string;         // 응답 컨테이너
    fileInput?: string;       // Phase 3
  };
  insertText(text: string): void;   // execCommand('insertText') 또는 InputEvent
  submit(): void;
  observeResponse(cb: (text: string, done: boolean) => void): void;
  currentConversationUrl(): string;
}
```
- 셀렉터는 코드가 아닌 JSON에 두어 사이트 개편 시 재빌드 없이 수정 가능하게 한다.
- 응답 완료 판정: 응답 DOM에 3초간 mutation 없음 → done.
- 어댑터 실패는 해당 패널만 격리 (다른 패널 정상 동작).

---

## 5. 데이터

### 로컬 (`~/Library/Application Support/jilseo/`)
```
workstations.json   // [{id, name, panels:[{serviceId, conversationUrl}], layout}]
presets.json        // 자주 쓰는 패널 조합
settings.json
```

### Supabase (별도 Free 프로젝트 `jilseo`)
```sql
create table prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  folder text, title text, body text not null,
  created_at timestamptz default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  service_id text, conversation_url text,
  content text not null,
  created_at timestamptz default now()
);

create table comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  prompt text not null,
  responses jsonb not null,   -- {chatgpt:"...", claude:"...", ...}
  device text,                -- "mac_studio" | "macbook"
  created_at timestamptz default now()
);
-- 3개 테이블 모두 RLS: auth.uid() = user_id
```
- 인증: 이메일 로그인 1계정. 세션은 로컬 파일에 보관.
- 저장 실패 시 로컬 큐잉 후 재시도.
- Free 프로젝트 일시정지 방지: Mac Studio cron에 일 1회 `select count(*) from comparisons` REST 호출 추가 (별도 작업).

---

## 6. 작업 순서

### Day 1 — Go/No-Go 검증 (가장 중요)
1. Tauri 2 프로젝트 생성, multiwebview 활성화
2. 창 하나에 webview 3개(ChatGPT·Claude·Gemini) 배치
3. **세 서비스 모두 로그인 성공 + 앱 재시작 후 로그인 유지 확인**
4. Gemini(Google 로그인)가 막히면: User-Agent를 Safari 최신으로 고정 후 재시도 → 그래도 막히면 Electron 전환 결정
5. 결과를 `docs/day1-verification.md`에 기록

### Day 2~3 — Phase 1
- Broadcast 바, 5종 어댑터, 독, 슬롯 최대화
- 어댑터별 수동 테스트 체크리스트 (`docs/adapter-test.md`)

### Day 4~5 — Phase 2
- 워크스테이션 저장/복원, Supabase 연동(프롬프트·메모·비교기록)
- dmg 빌드, MacBook에 설치해 병행 검증

### 이후 — Phase 3
- 파일 Broadcast (WKWebView는 CDP가 없으므로 JS `DataTransfer` + `drop` 이벤트 방식), 웹슬롯, 마크다운 변환

---

## 7. 완료 기준 (Phase 1)

- [ ] 두 맥에서 동일 dmg 설치, 각각 로그인 유지
- [ ] 질문 1건 입력 → 5개 패널 모두 5초 내 전송 확인
- [ ] 패널 하나 어댑터 실패 시 나머지 정상 동작
- [ ] 셀렉터 JSON 수정 후 앱 재시작만으로 반영
- [ ] 앱 종료 → 재시작 시 마지막 패널 구성 복원

---

## 8. 제약·주의

- **API 호출 금지.** 반드시 웹 UI DOM 주입만 사용 (구독 계정 그대로 쓰는 것이 목적).
- 각 서비스 약관상 자동화 접근 리스크 있음 → 전송 간격에 300ms 랜덤 지터, 자동 반복 전송 기능은 만들지 않는다.
- 셀렉터·주입 로직은 사이트 개편으로 깨질 수 있음을 전제로, 실패 격리와 JSON 외부화를 최우선 설계 원칙으로 한다.
- 로그인 정보·쿠키는 앱이 직접 다루지 않는다. webview 파티션에 맡긴다.
- 모바일 지원 없음. macOS 전용.

---

## 9. Claude Code 실행 지침

- 기존 스킬 적용: `verify-before-done`, `ai-coding-checklist`, `andon-signal`
- Day 1 검증 결과가 나오기 전에는 Phase 1 UI 작업을 시작하지 않는다.
- 어댑터 셀렉터는 실제 사이트 DOM을 확인해 작성하고, 추정값을 넣지 않는다. 확인 불가 시 `TODO(selector)` 표기 후 보고.
- 각 Phase 종료 시 `docs/CHANGELOG.md` 갱신.
