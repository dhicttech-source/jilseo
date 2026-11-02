import { openUrl } from "@tauri-apps/plugin-opener";

export const GUIDE_URL = "https://github.com/dhicttech-source/jilseo/blob/main/docs/USER-GUIDE.md";

export type HelpTopic = "stage" | "scorecard" | "settings";

const SECTIONS: { id: HelpTopic | "start"; title: string; lines: string[] }[] = [
  {
    id: "start",
    title: "처음이라면 이 순서로",
    lines: [
      "1. 각 패널 안에서 서비스에 로그인 (비밀번호 방식, 패스키는 안 됨)",
      "2. 동시 전송: 모드가 \"동시\"인지 보고 질문을 쓴 뒤 ▶ 보내기 → 답이 나란히",
      "3. 응답 평가: 전송 바 위 줄에서 가장 좋은 답 ★, 실패한 답 ✕",
      "4. 생성→검증: 모드를 바꾸고 프리셋을 고른 뒤 보내기 → 판정 요약 카드에서 맞는/틀린 지적 채택",
      "5. 성적표: 평가·채택이 쌓이면 서비스별로 무엇을 잘하는지 숫자로 보임 (설정 없이 이 기기 기록으로 바로 집계)",
    ],
  },
  {
    id: "stage",
    title: "스테이지와 전송 바",
    lines: [
      "독(아래 서비스 이름)을 눌러 패널을 올리고 내림 · 열 수 조절 · 일반 웹 페이지는 웹슬롯",
      "🔓/🔒 임시 전송: 켜면 이번 실행 동안 기록을 남기지 않음",
      "비식별화 검토/자동/끔: 보내기 전에 이름·연락처·기관명을 찾아 [인물A] 같은 기호로 가림",
      "📎 파일 1개를 모든 패널에 첨부 · 접두어: 모든 질문 앞에 붙일 문장 · 📚 프롬프트 라이브러리",
      "동시 ↔ 생성→검증: 패널 머리의 역할 칩(생성·검증·제외)과 렌즈, 프리셋, 깊이(빠름·표준·심층)",
      "⌘/Ctrl + Enter로도 보냄 · 결과는 Markdown 복사·저장",
    ],
  },
  {
    id: "scorecard",
    title: "성적표",
    lines: [
      "집계: 렌즈×서비스의 맞는 지적 비율, 생성 서비스 신뢰 비율, 동시 전송 ★·✕ 비율",
      "표의 칸·행을 누르면 그 숫자에 들어간 기록만 기록 탭에서 보여 줌",
      "기록: 지난 비교 검색 → 펼쳐서 다시 읽기, 평가·채택 고치기, 입력창에 다시 넣기, 삭제",
      "이 기기 기록으로 집계. Supabase에 로그인돼 있으면 열 때마다 다른 기기 기록과 합침 (머리말에 상태 표시)",
    ],
  },
  {
    id: "settings",
    title: "설정",
    lines: [
      "기록 저장 위치(맨 위): 기록 파일 경로·건수·크기, 폴더에서 보기, 기록 지우기 (이 기기만 / Supabase 포함 모두)",
      "Supabase(선택): 두 기기 동기화·백업. Project URL과 Publishable key 입력, 로그인 계정은 Supabase 대시보드 Authentication → Add user에서 만듦",
      "이 기기: 기기 이름(기록에 남음) · 화면 크기",
      "비식별화: 기본 모드, 항상 가릴 단어, 가리지 않을 단어",
      "전송 횟수 한도 경고: 무료 플랜 제한 대비 서비스별 하루 한도",
      "검증 렌즈·수정 단계 템플릿: 검증 질문 문구를 직접 고치기",
    ],
  },
];

/**
 * 도움말 화면. 스테이지 대신 표시된다(네이티브 패널 위에 겹치지 않도록). 들어온 화면의 항목을 먼저 보여 준다.
 * 자세한 단계별 안내는 docs/USER-GUIDE.md (GitHub).
 */
export function Help({ from, onClose }: { from: HelpTopic; onClose: () => void }) {
  const ordered = [...SECTIONS].sort((a, b) => (a.id === from ? -1 : b.id === from ? 1 : 0));
  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium text-white/90">도움말</h1>
          <button onClick={() => void openUrl(GUIDE_URL).catch(() => {})} className="rounded bg-sky-400/15 px-3 py-1 text-xs text-sky-200 hover:bg-sky-400/25" title={GUIDE_URL}>
            전체 사용 설명서 열기 (GitHub)
          </button>
          <button onClick={onClose} className="ml-auto rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20">
            돌아가기
          </button>
        </div>
        {ordered.map((s) => (
          <section key={s.id} className={"flex flex-col gap-1.5 rounded-lg border p-4 " + (s.id === from ? "border-sky-400/30 bg-sky-400/[0.04]" : "border-white/10")}>
            <h2 className="text-sm font-medium text-white/85">
              {s.title}
              {s.id === from && <span className="ml-2 text-xs font-normal text-sky-200/70">지금 보던 화면</span>}
            </h2>
            <ul className="flex flex-col gap-1 text-sm text-white/70">
              {s.lines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-white/35">
          막히면 헤더의 "진단"을 눌러 보고, 계속 실패하면 진단 결과와 함께 GitHub 이슈로 알려 주세요. 앱은 API를 쓰지 않고 각 서비스의 웹 화면에 직접 입력하므로, 서비스 화면이 바뀌면 일시적으로 실패할 수 있습니다.
        </p>
      </div>
    </main>
  );
}
