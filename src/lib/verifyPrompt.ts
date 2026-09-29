/** 검증 패널에 보내는 프롬프트 조립. 생성 답변이 길면 잘라서 주입 시간을 제한한다. */
export const MAX_ANSWER_CHARS = 20_000;
const TRUNCATED_MARK = "\n…(이하 생략)";

export const DEFAULT_VERIFY_TEMPLATE = `다음은 어떤 질문과 그에 대한 다른 AI의 답변입니다. 답변을 검증해 주세요.

[질문]
{question}

[답변]
{answer}

검증 항목:
1. 사실 오류가 있으면 해당 문장을 인용하고 근거와 함께 바로잡아 주세요.
2. 논리적 결함이나 근거 없는 주장을 지적해 주세요.
3. 질문에 답하려면 꼭 필요한데 빠진 내용을 보충해 주세요.
4. 마지막에 "판정: 신뢰 가능 / 일부 수정 필요 / 신뢰 불가" 중 하나와 한 줄 이유를 적어 주세요.`;

export const truncateAnswer = (answer: string, max = MAX_ANSWER_CHARS) =>
  answer.length > max ? answer.slice(0, max) + TRUNCATED_MARK : answer;

export function buildVerifyPrompt(template: string, question: string, answer: string): string {
  const tpl = template.includes("{answer}") ? template : `${template}\n\n[답변]\n{answer}`;
  return tpl.replace(/\{question\}/g, () => question).replace(/\{answer\}/g, () => truncateAnswer(answer));
}

/** 비교 기록 responses 키: 생성은 서비스 id 그대로, 검증은 verify: 접두어 */
export const VERIFY_KEY_PREFIX = "verify:";
export const verifyKey = (serviceId: string) => `${VERIFY_KEY_PREFIX}${serviceId}`;
