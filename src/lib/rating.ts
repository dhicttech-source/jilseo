/**
 * 동시 전송 응답 평가. 비교 기록 responses jsonb의 `_rating` 키에 저장한다 (스키마 변경 없이).
 * ★ 최고는 기록당 1개, ✕ 실패(빈 응답·끊김·엉뚱한 답)는 여러 개. 한 서비스가 둘 다일 수는 없다.
 */
export const RATING_KEY = "_rating";

export interface Rating {
  best: string | null;
  fail: string[];
  /** 마지막으로 평가한 시각 (ISO) */
  at?: string;
}

export const emptyRating = (): Rating => ({ best: null, fail: [] });

export const isRated = (r: Rating | null | undefined): r is Rating => !!r && (!!r.best || r.fail.length > 0);

/** ★ 최고: 같은 서비스를 다시 누르면 해제. 실패로 표시돼 있었으면 실패를 푼다 */
export function toggleBest(r: Rating, id: string, now = new Date().toISOString()): Rating {
  const best = r.best === id ? null : id;
  return { best, fail: r.fail.filter((x) => x !== id || best !== id), at: now };
}

/** ✕ 실패: 토글. 최고였으면 최고를 푼다 */
export function toggleFail(r: Rating, id: string, now = new Date().toISOString()): Rating {
  const failing = r.fail.includes(id);
  return {
    best: !failing && r.best === id ? null : r.best,
    fail: failing ? r.fail.filter((x) => x !== id) : [...r.fail, id],
    at: now,
  };
}

/** 기록 responses에서 평가를 읽는다. 형식이 어긋나면 null */
export function readRating(responses: Record<string, unknown> | null | undefined): Rating | null {
  const v = responses?.[RATING_KEY];
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const best = typeof o.best === "string" && o.best ? o.best : null;
  const fail = Array.isArray(o.fail) ? o.fail.filter((x): x is string => typeof x === "string") : [];
  return { best, fail, ...(typeof o.at === "string" ? { at: o.at } : {}) };
}

/** 평가를 붙인 responses 사본. 평가가 비면 키를 지운다 */
export function withRating(responses: Record<string, unknown>, rating: Rating): Record<string, unknown> {
  const { [RATING_KEY]: _old, ...rest } = responses;
  void _old;
  return isRated(rating) ? { ...rest, [RATING_KEY]: rating } : rest;
}
