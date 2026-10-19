/**
 * 프롬프트 라이브러리 변수: 본문의 `{{이름}}`을 삽입 시 채운다.
 * 두 겹 중괄호라 검증 렌즈의 한 겹 `{question}`·`{answer}`와 섞이지 않는다. 치환 방식은 렌즈와 같다(정규식 전역 치환, `$` 안전).
 */
const VAR_RE = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;

/** 본문에 등장하는 변수 이름을 등장 순서대로, 중복 없이 */
export function extractVars(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(VAR_RE)) {
    const name = m[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

export const hasVars = (body: string) => extractVars(body).length > 0;

/** 변수 치환. 값이 없는 변수는 자리표시자를 그대로 둔다(사용자가 눈치채도록). */
export function fillVars(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (whole, raw: string) => {
    const name = raw.trim();
    const v = values[name];
    return v === undefined || v === "" ? whole : v;
  });
}

/** 접두어 결합: 워크스테이션 접두어가 있으면 본문 앞에 빈 줄 하나를 두고 붙인다 */
export function composePrompt(prefix: string | undefined, text: string): string {
  const p = (prefix ?? "").trim();
  const t = text.trim();
  if (!p) return t;
  if (!t) return p;
  return `${p}\n\n${t}`;
}
