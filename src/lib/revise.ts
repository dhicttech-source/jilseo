/**
 * 수정 단계 (설계 §7): 검증 판정을 생성 패널의 같은 대화에 되돌려 수정본을 받는다.
 * 질문과 원답은 그 대화에 이미 있으므로 판정만 전달한다. 생성 모델이 지적에 무조건 굴복하지 않도록
 * "동의하지 않는 지적은 이유를 밝히고 유지" 조항을 둔다.
 */
export const REVISE_TEMPLATE_KEY = "revise";
export const MAX_VERDICT_CHARS = 4_000;

export const DEFAULT_REVISE_TEMPLATE = `방금 당신이 쓴 답변을 다른 검토자들이 아래와 같이 검증했습니다.

{verdicts}

지시:
1. 타당한 지적은 반영해 답변을 수정하세요. 사실 오류는 바로잡고, 빠진 내용은 보충하세요.
2. 동의하지 않는 지적은 그 이유를 한 줄로 밝히고 원래 내용을 유지하세요. 지적이라고 해서 무조건 따르지 마세요.
3. 먼저 "바뀐 점"을 3~5줄로 요약한 뒤, 이어서 수정본 전체를 쓰세요.`;

export interface VerdictForRevise {
  /** 검증 패널 표시 이름 */
  name: string;
  lensName: string;
  /** 판정 원문 (Markdown). 비었으면 제외 */
  text: string;
}

export const REVISED_KEY_PREFIX = "revised:";
export const revisedKey = (generatorId: string) => `${REVISED_KEY_PREFIX}${generatorId}`;

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n…(이하 생략)` : s);

/** 판정 목록 → 템플릿의 {verdicts} 자리에 들어갈 본문. 빈 판정은 뺀다. */
export function formatVerdicts(verdicts: VerdictForRevise[], maxPerVerifier = MAX_VERDICT_CHARS): string {
  return verdicts
    .filter((v) => v.text.trim())
    .map((v, i) => `[검토자 ${i + 1}: ${v.name} · ${v.lensName} 렌즈]\n${truncate(v.text.trim(), maxPerVerifier)}`)
    .join("\n\n");
}

/** 수정 프롬프트 조립. 판정이 하나도 없으면 null (보낼 이유가 없다). */
export function buildRevisePrompt(template: string, verdicts: VerdictForRevise[], maxPerVerifier = MAX_VERDICT_CHARS): string | null {
  const body = formatVerdicts(verdicts, maxPerVerifier);
  if (!body) return null;
  const tpl = template.includes("{verdicts}") ? template : `${template}\n\n{verdicts}`;
  return tpl.replace(/\{verdicts\}/g, () => body);
}
