import {
  ACCOUNT_CONTEXT_RE,
  ACCOUNT_NUMBER_RE,
  ADDRESS_RE,
  BIZNO_RE,
  CARD_RE,
  DRIVER_RE,
  EMAIL_RE,
  IP_RE,
  NAME_STOPWORDS,
  ORG_EN_RE,
  ORG_GENERIC,
  ORG_PREFIX_RE,
  ORG_SUFFIX_CORP_RE,
  ORG_SUFFIX_RE,
  PASSPORT_CONTEXT_RE,
  PASSPORT_NUMBER_RE,
  PERSON_TITLE_AFTER_RE,
  PERSON_TITLE_BEFORE_RE,
  PHONE_RE,
  RRN_COMPACT_RE,
  RRN_RE,
  biznoOk,
  luhnOk,
  type Confidence,
  type PiiKind,
} from "./patterns";

export interface PiiHit {
  start: number;
  end: number;
  kind: PiiKind;
  text: string;
  confidence: Confidence;
}

export interface DetectOptions {
  /** 항상 가릴 단어 (사용자 사전) */
  always?: string[];
  /** 가리지 않을 단어 (허용 목록) */
  never?: string[];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scan(text: string, re: RegExp, kind: PiiKind, confidence: Confidence, accept?: (m: RegExpExecArray) => boolean, group = 0): PiiHit[] {
  const out: PiiHit[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (accept && !accept(m)) continue;
    const t = m[group];
    if (!t) continue;
    const start = m.index + (group === 0 ? 0 : m[0].indexOf(t));
    out.push({ start, end: start + t.length, kind, text: t, confidence });
  }
  return out;
}

/** 문맥 단어 뒤 range 글자 안의 번호만 */
function scanNear(text: string, contextRe: RegExp, numberRe: RegExp, kind: PiiKind, range = 25): PiiHit[] {
  const windows: [number, number][] = [];
  contextRe.lastIndex = 0;
  for (let m = contextRe.exec(text); m; m = contextRe.exec(text)) windows.push([m.index, m.index + m[0].length + range]);
  if (!windows.length) return [];
  return scan(text, numberRe, kind, "high").filter((h) => windows.some(([a, b]) => h.start >= a && h.start <= b));
}

/** 겹치면 사용자 사전 > 높은 신뢰도 > 긴 구간 > 앞선 구간 */
function resolveOverlaps(hits: PiiHit[]): PiiHit[] {
  const rank = (h: PiiHit) => (h.kind === "custom" ? 2 : h.confidence === "high" ? 1 : 0);
  const sorted = [...hits].sort((a, b) => rank(b) - rank(a) || b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: PiiHit[] = [];
  for (const h of sorted) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept.sort((a, b) => a.start - b.start);
}

const norm = (s: string) => s.trim().toLowerCase();

/** "(주)한빛소프트와"처럼 법인 표기 뒤에 붙은 조사를 떼어 낸다 (이름 끝 글자로 흔한 이·가·도·로는 건드리지 않음) */
const ORG_TRAILING_PARTICLE = /[와과의은는을를에]$/;
function trimOrgParticle(h: PiiHit): PiiHit {
  if (h.kind !== "org" || !ORG_TRAILING_PARTICLE.test(h.text)) return h;
  const stem = h.text.replace(/^(?:주식회사|유한회사|사단법인|재단법인|학교법인|의료법인|사회복지법인|\(주\)|㈜|\(유\)|\(사\)|\(재\))\s?/, "");
  if (stem.length < 3) return h;
  return { ...h, text: h.text.slice(0, -1), end: h.end - 1 };
}

/**
 * 텍스트에서 개인정보·기관명 후보를 찾는다. 결과는 겹침 없이 위치순.
 * 허용 목록에 있는 단어(또는 그 단어 안에 포함된 후보)는 제외한다.
 */
export function detectPii(text: string, opts: DetectOptions = {}): PiiHit[] {
  if (!text) return [];
  const hits: PiiHit[] = [
    ...scan(text, RRN_RE, "rrn", "high"),
    ...scan(text, RRN_COMPACT_RE, "rrn", "high"),
    ...scan(text, PHONE_RE, "phone", "high"),
    ...scan(text, EMAIL_RE, "email", "high"),
    ...scan(text, CARD_RE, "card", "high", (m) => luhnOk(m[0])),
    ...scanNear(text, ACCOUNT_CONTEXT_RE, ACCOUNT_NUMBER_RE, "account"),
    ...scanNear(text, PASSPORT_CONTEXT_RE, PASSPORT_NUMBER_RE, "passport"),
    ...scan(text, DRIVER_RE, "driver", "high"),
    ...scan(text, BIZNO_RE, "bizno", "high", (m) => biznoOk(m[0])),
    ...scan(text, IP_RE, "ip", "high"),
    ...scan(text, ADDRESS_RE, "address", "medium"),
    ...scan(text, PERSON_TITLE_AFTER_RE, "person", "medium", (m) => !NAME_STOPWORDS.has(m[1]), 1),
    ...scan(text, PERSON_TITLE_BEFORE_RE, "person", "medium", (m) => !NAME_STOPWORDS.has(m[1]), 1),
    ...scan(text, ORG_PREFIX_RE, "org", "medium"),
    ...scan(text, ORG_SUFFIX_CORP_RE, "org", "medium"),
    ...scan(text, ORG_SUFFIX_RE, "org", "medium", (m) => !ORG_GENERIC.has(m[0]) && !NAME_STOPWORDS.has(m[0])),
    ...scan(text, ORG_EN_RE, "org", "medium"),
  ];
  for (const word of opts.always ?? []) {
    const w = word.trim();
    if (w.length < 2) continue;
    hits.push(...scan(text, new RegExp(escapeRe(w), "gi"), "custom", "high"));
  }
  const never = (opts.never ?? []).map(norm).filter(Boolean);
  const allowed = (h: PiiHit) => h.kind === "custom" || !never.some((n) => norm(h.text) === n || n.includes(norm(h.text)));
  return resolveOverlaps(hits.map(trimOrgParticle).filter(allowed));
}
