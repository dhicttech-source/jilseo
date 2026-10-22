import { detectPii, type DetectOptions, type PiiHit } from "./detect";
import { KIND_LABEL, LETTER_KINDS, PARTICLE_START, type Confidence, type PiiKind } from "./patterns";

/** 가릴 대상 텍스트 하나 (프롬프트, 첨부 본문, 첨부 파일명) */
export interface MaskSource {
  id: string;
  label: string;
  text: string;
}

/** 같은 원문을 묶은 검토 단위. 검토 패널의 한 줄 */
export interface PiiGroup {
  key: string;
  kind: PiiKind;
  original: string;
  token: string;
  confidence: Confidence;
  /** 출처별 등장 횟수 (탐지 위치 기준) */
  counts: Record<string, number>;
  checked: boolean;
}

export interface MaskEntry {
  token: string;
  original: string;
  kind: PiiKind;
}

/** 번호류는 숫자만, 나머지는 공백 정리 후 비교 */
const NUMERIC: ReadonlySet<PiiKind> = new Set(["rrn", "phone", "card", "account", "bizno", "driver"]);
export const groupKey = (kind: PiiKind, text: string) =>
  `${kind}:${NUMERIC.has(kind) ? text.replace(/\D/g, "") : text.trim().replace(/\s+/g, " ").toLowerCase()}`;

const letterOf = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letterOf(Math.floor(i / 26) - 1) + letterOf(i % 26));
export const makeToken = (kind: PiiKind, index: number) =>
  `[${KIND_LABEL[kind]}${LETTER_KINDS.has(kind) ? letterOf(index) : String(index + 1)}]`;

/** 출처들을 탐지해 원문별로 묶고, 종류별 등장 순서로 기호를 정한다. 기본은 모두 체크 */
export function buildGroups(sources: MaskSource[], opts: DetectOptions = {}): { groups: PiiGroup[]; hits: Record<string, PiiHit[]> } {
  const hits: Record<string, PiiHit[]> = {};
  const byKey = new Map<string, PiiGroup>();
  const perKind = new Map<PiiKind, number>();
  for (const src of sources) {
    hits[src.id] = detectPii(src.text, opts);
    for (const h of hits[src.id]) {
      const key = groupKey(h.kind, h.text);
      let g = byKey.get(key);
      if (!g) {
        const n = perKind.get(h.kind) ?? 0;
        perKind.set(h.kind, n + 1);
        g = { key, kind: h.kind, original: h.text.trim(), token: makeToken(h.kind, n), confidence: h.confidence, counts: {}, checked: true };
        byKey.set(key, g);
      }
      g.counts[src.id] = (g.counts[src.id] ?? 0) + 1;
    }
  }
  return { groups: [...byKey.values()], hits };
}

/** 사용자가 직접 추가한 단어를 묶음에 넣는다 (이미 있으면 체크만) */
export function addManualGroup(groups: PiiGroup[], sources: MaskSource[], word: string): PiiGroup[] {
  const w = word.trim();
  if (w.length < 2) return groups;
  const key = groupKey("custom", w);
  const existing = groups.find((g) => g.original === w || g.key === key);
  if (existing) return groups.map((g) => (g === existing ? { ...g, checked: true } : g));
  const n = groups.filter((g) => g.kind === "custom").length;
  const counts: Record<string, number> = {};
  for (const s of sources) {
    const c = s.text.split(w).length - 1;
    if (c) counts[s.id] = c;
  }
  return [...groups, { key, kind: "custom", original: w, token: makeToken("custom", n), confidence: "high", counts, checked: true }];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 원문 → 치환 정규식. 탐지 위치뿐 아니라 텍스트 안의 모든 등장(호칭 없이 쓴 이름, 첨부 안의 같은 이름)을 바꾼다.
 * - 번호류: 앞뒤가 숫자가 아니어야 하고, 구분자(-, 공백, .) 차이는 허용
 * - 이름: 앞은 한글·영숫자가 아니고, 뒤는 한글이 아니거나 조사·호칭으로 시작 ("이수"가 "이수정"·"이수했다"를 건드리지 않게)
 * - 기관·주소·이메일·직접 추가: 원문 그대로
 */
function replacerFor(g: PiiGroup): RegExp {
  if (NUMERIC.has(g.kind)) {
    const digits = g.original.replace(/\D/g, "").split("").map(escapeRe);
    return new RegExp(`(?<!\\d)${digits.join("[-.\\s]?")}(?!\\d)`, "g");
  }
  const body = escapeRe(g.original).replace(/\s+/g, "\\s+");
  // 탐지(대소문자 무시)와 치환이 어긋나면 철자만 다른 등장이 새어 나가므로 모든 종류를 대소문자 무시로 바꾼다
  if (g.kind === "person") return new RegExp(`(?<![가-힣A-Za-z0-9])${body}(?=[${PARTICLE_START}]|[^가-힣]|$)`, "gi");
  if (g.kind === "org") {
    // "(주)한빛소프트"를 가리면 법인 표기 없이 쓴 "한빛소프트"도 같은 기호로 (긴 쪽 먼저)
    const stem = orgStem(g.original);
    const alts = stem && stem !== g.original ? [body, escapeRe(stem).replace(/\s+/g, "\\s+")] : [body];
    return new RegExp(alts.join("|"), "gi");
  }
  return new RegExp(body, "gi");
}

/** 기관명에서 법인 표기를 뗀 고유명 부분. 2글자 미만이면 null */
export function orgStem(original: string): string | null {
  const stem = original
    .replace(/^(?:주식회사|유한회사|사단법인|재단법인|학교법인|의료법인|사회복지법인|\(주\)|㈜|\(유\)|\(사\)|\(재\))\s?/, "")
    .replace(/\s?(?:주식회사|\(주\)|㈜)$/, "")
    .replace(/\s?(?:Inc|Corp|Corporation|Co|Ltd|LLC|GmbH|PLC|Holdings)\.?$/, "")
    .trim();
  return stem.length >= 2 ? stem : null;
}

/** 체크된 묶음으로 출처 전부를 가린다. 긴 원문부터 바꿔 부분 겹침을 막는다 */
export function applyMask(sources: MaskSource[], groups: PiiGroup[]): { texts: Record<string, string>; mapping: MaskEntry[] } {
  const active = groups.filter((g) => g.checked).sort((a, b) => b.original.length - a.original.length);
  const texts: Record<string, string> = {};
  for (const src of sources) {
    let t = src.text;
    for (const g of active) t = t.replace(replacerFor(g), () => g.token);
    texts[src.id] = t;
  }
  return { texts, mapping: active.map((g) => ({ token: g.token, original: g.original, kind: g.kind })) };
}

/**
 * 기호 → 원문 복원 (로컬 표시·내보내기용). 모델이 "[인물 A]"처럼 띄어 쓰거나,
 * 응답의 Markdown 변환이 "\[인물A\]"처럼 대괄호를 이스케이프해도 맞춘다.
 * 긴 접미어부터 바꿔 [인물AA]가 [인물A]로 잘못 바뀌지 않게 한다.
 */
export function restore(text: string, mapping: MaskEntry[]): string {
  let t = text;
  const ordered = [...mapping].sort((a, b) => b.token.length - a.token.length);
  for (const m of ordered) {
    const inner = m.token.slice(1, -1);
    const label = inner.replace(/[A-Z]+$|\d+$/, "");
    const suffix = inner.slice(label.length);
    const re = new RegExp(`\\\\?\\[\\s*${escapeRe(label)}\\s*${escapeRe(suffix)}\\s*\\\\?\\]`, "g");
    t = t.replace(re, () => m.original);
  }
  return t;
}

/** 기록 메타(원문 없음): 가린 개수와 종류 */
export function maskSummary(mapping: MaskEntry[]): { count: number; kinds: PiiKind[] } {
  return { count: mapping.length, kinds: [...new Set(mapping.map((m) => m.kind))].sort() };
}
