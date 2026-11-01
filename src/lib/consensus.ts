import type { Grade } from "./lenses";

/**
 * 합의 요약 (설계 §10): 요약 카드 헤더의 등급 분포와, 검증자 둘 이상이 같은 내용을 짚은 "공통 지적".
 * 비교는 이 기기 안의 글자 단위 유사도만 쓴다 (외부 호출 없음).
 */

export const GRADE_SHORT: Record<Grade, string> = { trust: "신뢰", revise: "수정", distrust: "불신", unknown: "불명" };
const GRADE_ORDER: Grade[] = ["trust", "revise", "distrust", "unknown"];

/** 등급 분포 문구: "신뢰 2 · 수정 1". 전송에 실패한 검증자는 뺀다 */
export function gradeDistribution(items: { grade: Grade; sent: boolean }[]): string {
  const n: Partial<Record<Grade, number>> = {};
  for (const it of items) if (it.sent) n[it.grade] = (n[it.grade] ?? 0) + 1;
  return GRADE_ORDER.filter((g) => n[g])
    .map((g) => `${GRADE_SHORT[g]} ${n[g]}`)
    .join(" · ");
}

/** 비교용 정규화: 공백·문장부호·마크다운 기호 제거, 소문자 */
const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = normalize(s);
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 글자 2개 단위 Dice 계수 (0~1). 한국어 어미·조사 차이에 덜 민감하다 */
export function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  let total = 0;
  for (const v of A.values()) total += v;
  for (const v of B.values()) total += v;
  if (total === 0) return 0;
  let common = 0;
  for (const [g, v] of A) common += Math.min(v, B.get(g) ?? 0);
  return (2 * common) / total;
}

export interface CommonPoint {
  /** 대표 문구 (먼저 나온 검증자의 핵심 줄) */
  text: string;
  /** 같은 내용을 짚은 검증 서비스 id (2개 이상) */
  by: string[];
}

export const COMMON_THRESHOLD = 0.4;

/**
 * 검증자들의 핵심 줄 중 서로 다른 검증자 둘 이상이 비슷하게 쓴 것을 묶는다.
 * 한 줄은 가장 비슷한 묶음 하나에만 들어가고, 같은 검증자의 줄끼리는 묶지 않는다.
 */
export function commonPoints(items: { serviceId: string; headline: string[] }[], threshold = COMMON_THRESHOLD): CommonPoint[] {
  const groups: { text: string; members: { serviceId: string; line: string }[] }[] = [];
  for (const it of items) {
    for (const line of it.headline) {
      if (normalize(line).length < 4) continue; // 너무 짧은 줄은 우연히 겹친다
      let best: (typeof groups)[number] | null = null;
      let bestSim = threshold;
      for (const g of groups) {
        if (g.members.some((m) => m.serviceId === it.serviceId)) continue;
        const sim = Math.max(...g.members.map((m) => similarity(m.line, line)));
        if (sim >= bestSim) {
          best = g;
          bestSim = sim;
        }
      }
      if (best) best.members.push({ serviceId: it.serviceId, line });
      else groups.push({ text: line, members: [{ serviceId: it.serviceId, line }] });
    }
  }
  return groups
    .filter((g) => g.members.length >= 2)
    .map((g) => ({ text: g.text, by: g.members.map((m) => m.serviceId) }))
    .sort((a, b) => b.by.length - a.by.length);
}
