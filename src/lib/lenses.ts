import { buildVerifyPrompt, DEFAULT_VERIFY_TEMPLATE } from "./verifyPrompt";

/**
 * 검증 렌즈: 검증 패널 하나에 넣는 짧은 방법론 템플릿 (docs/verification-lens-design-2026-09-30.md §3).
 * 패널 하나 = 렌즈 하나. 모든 렌즈는 같은 판정 블록으로 끝난다.
 */
export interface Lens {
  id: string;
  name: string;
  icon: string;
  description: string;
  template: string;
  /** 이 렌즈에 맞는 서비스 id (표시용 권장, 강제 아님) */
  recommended: string[];
  builtin: boolean;
}

export const VERDICT_MARK = "=== 판정 ===";

/** 모든 렌즈 끝에 붙는 고정 판정 블록. 앱이 parseVerdict로 읽는다. */
export const VERDICT_BLOCK = `마지막에 반드시 아래 형식을 그대로 출력하세요 (다른 말 덧붙이지 말 것):
${VERDICT_MARK}
등급: 신뢰 가능 / 일부 수정 필요 / 신뢰 불가 중 하나만
지적: 심각 N / 보통 N / 경미 N
핵심:
- (가장 중요한 지적 한 줄)
- (둘째 줄, 없으면 생략)
- (셋째 줄, 없으면 생략)`;

const QA = `[질문]
{question}

[답변]
{answer}`;

export const COMPOSITE_LENS_ID = "composite";

export const BUILTIN_LENSES: Lens[] = [
  {
    id: COMPOSITE_LENS_ID,
    name: "종합",
    icon: "◎",
    description: "사실·논리·누락을 한 번에 훑는 종합 검토. 검증 패널이 하나뿐인 빠른 검토용",
    template: DEFAULT_VERIFY_TEMPLATE,
    recommended: [],
    builtin: true,
  },
  {
    id: "fact",
    name: "사실",
    icon: "⚪",
    description: "주장 단위로 분해해 확인·반박·확인불가와 출처를 표시 (SIFT·CRAAP). 검색 가능한 서비스에 배정",
    template: `다음 답변을 사실 검증만 하세요. 의견·추론·문체는 다루지 않습니다.

${QA}

절차:
1. 답변에서 검증 가능한 사실 주장을 번호를 붙여 분리하세요 (수치·날짜·이름·인용·규정 등).
2. 각 주장에 대해 "확인 / 반박 / 확인 불가" 중 하나를 붙이고, 확인·반박은 출처(기관·문서·URL)와 그 정보의 시점을 적으세요. 출처를 모르면 지어내지 말고 "확인 불가"로 두세요.
3. 답변이 오래됐을 수 있는 정보(가격·직위·통계·버전)에는 "최신성 주의"를 표시하세요.
4. 답변이 자신 있게 단정한 문장일수록 더 엄격하게 보세요.`,
    recommended: ["perplexity", "grok", "chatgpt"],
    builtin: true,
  },
  {
    id: "logic",
    name: "논리",
    icon: "🧠",
    description: "당연시한 전제, 결론의 함의, 빠진 반대 관점 (Paul-Elder 핵심 3)",
    template: `다음 답변의 추론 구조만 검토하세요. 사실 여부는 판단하지 않습니다.

${QA}

세 가지만 답하세요.
1. 전제(Assumptions): 답변이 말하지 않고 당연시한 전제를 최대 3개 적고, 각각이 틀릴 수 있는 상황을 한 줄로.
2. 함의(Implications): 이 결론이 맞다면 따라오는 결과와, 답변이 언급하지 않은 부작용.
3. 관점(Point of View): 답변이 놓친 반대 입장이나 다른 이해관계자의 시각을 하나 이상 제시하고, 그 시각에서 답변이 어떻게 달라지는지.`,
    recommended: ["claude", "gemini"],
    builtin: true,
  },
  {
    id: "risk",
    name: "위험",
    icon: "⚫",
    description: "틀렸다고 가정하고 실패 이유부터 찾기 (검은 모자·Pre-mortem·역방향 검증)",
    template: `이 답변은 이미 틀렸거나 실패한 것으로 판명됐다고 가정하세요. 왜 그렇게 됐는지 찾는 것이 당신의 역할입니다.

${QA}

1. Pre-mortem: 이 답변을 따랐다가 문제가 생겼다면 가장 그럴듯한 원인 3가지를 확률이 높은 순으로.
2. 역방향 검증: 답변의 "A이므로 B" 형태 주장마다, A인데 B가 아닌 사례를 하나씩 드세요.
3. 과신 표시: 근거 없이 단정한 문장을 인용하고, 어느 정도 확신이 적절한지 적으세요.
4. 답변이 다루지 않은 위험·엣지 케이스·예외 상황.
칭찬이나 균형 잡힌 총평은 쓰지 마세요. 문제만 씁니다.`,
    recommended: ["claude", "gemini"],
    builtin: true,
  },
  {
    id: "strength",
    name: "강점",
    icon: "🟡",
    description: "유지해야 할 것과 잘한 이유. 비판을 읽기 전에 균형을 잡는 용도 (노란 모자)",
    template: `다음 답변의 강점만 찾으세요. 비판은 다른 검토자가 맡습니다.

${QA}

1. 유지해야 할 것 최대 3개와, 왜 좋은지 각 한 줄.
2. 이 답변이 질문의 의도를 어디까지 충족했는지 한 줄.
전체 5줄 이내로 쓰세요.`,
    recommended: [],
    builtin: true,
  },
  {
    id: "improve",
    name: "개선",
    icon: "🟢",
    description: "지적이 맞다면 어떻게 고칠지, 다음 행동 1~3개 (초록 모자)",
    template: `다음 답변을 더 낫게 만드는 방법만 제안하세요.

${QA}

1. 가장 효과가 큰 개선 1~3개를 구체적인 수정 문장이나 추가 내용으로 제시하세요.
2. 질문자가 다음에 할 행동을 1~3개, 실행 가능한 형태로.
3. 답변의 형식(길이·구조·표현)에서 바꿀 점이 있으면 한 줄.
원문을 통째로 다시 쓰지 말고 바뀌는 부분만 보여 주세요.`,
    recommended: ["chatgpt", "gemini"],
    builtin: true,
  },
  {
    id: "code",
    name: "코드",
    icon: "🔧",
    description: "동작 → 보안 → 품질 → 유지보수 순서로 레이어별 체크리스트 (코드 검토 4레이어)",
    template: `다음 답변에 포함된 코드를 레이어 순서대로 검토하세요. 한 레이어를 끝내기 전에 다음으로 넘어가지 말고, 항목을 건너뛰지 마세요.

${QA}

Layer 1 동작: 의도한 기능 구현 여부 / 빈 값·최대값·오류 입력 처리 / 실제로 실행되는지(문법·import·API 존재).
Layer 2 보안: 하드코딩된 키·비밀 / 외부 입력 검증 / 인증·인가 누락 / 인젝션·XSS 등.
Layer 3 품질: 이름이 의도를 드러내는지 / 함수 단일 책임 / 중복 / 에러 처리.
Layer 4 유지보수: 6개월 뒤에도 이해되는지 / 환경 변수로 빠져야 할 값 / 주석이 '왜'를 설명하는지.
레이어마다 "문제 없음" 또는 문제 목록(코드 위치 인용)을 적으세요.`,
    recommended: ["claude", "chatgpt"],
    builtin: true,
  },
  {
    id: "bias",
    name: "편향",
    icon: "🎭",
    description: "추천·의견 문장만 골라 이해관계·중립성·전문성 관점에서 점검 (RAVEN)",
    template: `다음 답변에서 사실이 아닌 추천·의견·평가 문장만 골라 편향을 점검하세요.

${QA}

각 의견 문장에 대해:
1. 어떤 이해관계나 관점이 그 의견을 유리하게 만드는가 (Vested interest).
2. 반대 입장을 공정하게 다뤘는가, 아니면 한쪽만 서술했는가 (Neutrality).
3. 그 의견을 뒷받침하는 전문성·근거가 제시됐는가 (Expertise).
4. 답변 전체의 어조가 특정 결론으로 유도하는지 한 줄.`,
    recommended: ["claude"],
    builtin: true,
  },
];

export const findBuiltinLens = (id: string) => BUILTIN_LENSES.find((l) => l.id === id);

/**
 * 렌즈 해석: 내장 렌즈 + 사용자 덮어쓰기 + 사용자 렌즈. 모르는 id는 종합 렌즈.
 */
export function resolveLens(id: string | undefined, overrides: Record<string, string>, custom: Lens[]): Lens {
  const base = (id && (findBuiltinLens(id) ?? custom.find((l) => l.id === id))) || findBuiltinLens(COMPOSITE_LENS_ID)!;
  const override = overrides[base.id];
  return override?.trim() ? { ...base, template: override } : base;
}

/** 렌즈 템플릿 + 판정 블록(없으면 추가) → 검증 프롬프트 */
export function buildLensPrompt(lens: Lens, question: string, answer: string): string {
  const tpl = lens.template.includes(VERDICT_MARK) ? lens.template : `${lens.template}\n\n${VERDICT_BLOCK}`;
  return buildVerifyPrompt(tpl, question, answer);
}

// ---------- 판정 파싱 ----------

export type Grade = "trust" | "revise" | "distrust" | "unknown";
export const GRADE_LABEL: Record<Grade, string> = {
  trust: "신뢰 가능",
  revise: "일부 수정 필요",
  distrust: "신뢰 불가",
  unknown: "형식 불명",
};

export type Judged = "right" | "wrong" | "hold";

export interface Verdict {
  lens: string;
  grade: Grade;
  counts: { severe: number; normal: number; minor: number };
  headline: string[];
  /** 판정 블록을 읽어냈는지 */
  parsed: boolean;
  /** 사람의 채택 (맞는 지적 / 틀린 지적 / 보류) */
  judged?: Judged;
}

/** 비교 기록 responses jsonb 안에서 판정 메타를 담는 키 (스키마 변경 없이 저장) */
export const VERDICTS_KEY = "_verdicts";

/** 마크다운 강조·이스케이프·인용 기호 제거 */
const plain = (s: string) =>
  s
    .replace(/\\([*_`#>~[\]()])/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/^[ \t]*[>#]+[ \t]*/gm, "")
    .replace(/ /g, " ");

const gradeOf = (s: string): Grade =>
  /신뢰\s*불가/.test(s) ? "distrust" : /일부\s*수정/.test(s) ? "revise" : /신뢰\s*가능/.test(s) ? "trust" : "unknown";

const num = (s: string, label: string) => {
  const m = new RegExp(`${label}\\s*[:：]?\\s*(\\d+)`).exec(s);
  return m ? Number(m[1]) : 0;
};

/**
 * 판정 블록 파싱. "=== 판정 ===" 뒤를 우선 읽고, 없으면 본문 끝 부분에서 "등급:"을 찾는다.
 * 관대하게 읽되, 등급을 못 찾으면 parsed=false / grade=unknown.
 */
export function parseVerdict(markdown: string, lens: string): Verdict {
  const text = plain(markdown);
  const markAt = text.lastIndexOf("판정 ===");
  const tail = markAt >= 0 ? text.slice(markAt) : text.slice(Math.max(0, text.length - 1500));
  const gradeLine = /등급\s*[:：]\s*([^\n]+)/.exec(tail);
  const grade = gradeLine ? gradeOf(gradeLine[1]) : "unknown";
  const countsLine = /지적\s*[:：]\s*([^\n]+)/.exec(tail)?.[1] ?? "";
  const counts = { severe: num(countsLine, "심각"), normal: num(countsLine, "보통"), minor: num(countsLine, "경미") };
  const headline: string[] = [];
  const coreAt = tail.search(/핵심\s*[:：]/);
  if (coreAt >= 0) {
    const after = tail.slice(coreAt).replace(/^핵심\s*[:：]\s*/, "");
    for (const raw of after.split("\n")) {
      const line = raw.replace(/^\s*(?:[-•·]|\d+[.)])\s*/, "").trim();
      if (!line) continue;
      if (/^\(.*\)$/.test(line)) continue; // 템플릿의 자리표시자를 그대로 돌려준 경우
      headline.push(line);
      if (headline.length >= 3) break;
    }
  }
  return { lens, grade, counts, headline, parsed: grade !== "unknown" };
}
