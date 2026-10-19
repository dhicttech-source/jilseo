/**
 * 서비스별 전송 횟수 기록 (LibreChat의 토큰 사용량 추적을 DOM 방식으로 옮긴 것).
 * 전송 성공 시각만 로컬 usage.json에 남기고 오늘 횟수를 세어 무료 플랜 한도를 미리 알린다. 전송을 막지는 않는다.
 */
export interface UsageLog {
  /** serviceId → 전송 성공 시각(ms) 목록 */
  sent: Record<string, number[]>;
}
export const KEEP_DAYS = 30;

export const emptyUsage = (): UsageLog => ({ sent: {} });

const dayStart = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** 전송 성공 기록 추가 + KEEP_DAYS 넘은 항목 정리. 새 객체를 돌려준다 */
export function recordSend(log: UsageLog, serviceIds: string[], now = Date.now()): UsageLog {
  const cutoff = now - KEEP_DAYS * 86_400_000;
  const sent: Record<string, number[]> = {};
  for (const [id, times] of Object.entries(log.sent)) {
    const kept = times.filter((t) => t >= cutoff);
    if (kept.length) sent[id] = kept;
  }
  for (const id of serviceIds) sent[id] = [...(sent[id] ?? []), now];
  return { sent };
}

/** 오늘(로컬 자정 기준) 서비스별 전송 횟수 */
export function countToday(log: UsageLog, now = Date.now()): Record<string, number> {
  const start = dayStart(now);
  const out: Record<string, number> = {};
  for (const [id, times] of Object.entries(log.sent)) {
    const n = times.filter((t) => t >= start && t <= now).length;
    if (n) out[id] = n;
  }
  return out;
}

/** 한도(0 또는 미설정 = 없음)에 도달한 서비스 */
export function overLimit(today: Record<string, number>, limits: Record<string, number>, ids: string[]): { id: string; count: number; limit: number }[] {
  return ids
    .map((id) => ({ id, count: today[id] ?? 0, limit: limits[id] ?? 0 }))
    .filter((x) => x.limit > 0 && x.count >= x.limit);
}
