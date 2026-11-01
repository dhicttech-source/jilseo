import { describe, expect, it } from "vitest";
import { RATING_KEY, emptyRating, isRated, readRating, toggleBest, toggleFail, withRating } from "./rating";

const T = "2026-11-02T00:00:00Z";

describe("toggleBest / toggleFail", () => {
  it("★ 최고는 하나만: 다른 서비스를 누르면 옮겨 가고, 같은 서비스를 다시 누르면 해제", () => {
    const a = toggleBest(emptyRating(), "claude", T);
    expect(a).toEqual({ best: "claude", fail: [], at: T });
    expect(toggleBest(a, "gemini", T).best).toBe("gemini");
    expect(toggleBest(a, "claude", T).best).toBeNull();
  });

  it("✕ 실패는 여러 개, 다시 누르면 해제", () => {
    const a = toggleFail(toggleFail(emptyRating(), "chatgpt", T), "grok", T);
    expect(a.fail).toEqual(["chatgpt", "grok"]);
    expect(toggleFail(a, "chatgpt", T).fail).toEqual(["grok"]);
  });

  it("한 서비스가 최고와 실패를 동시에 가질 수 없다", () => {
    const failed = toggleFail(emptyRating(), "claude", T);
    const best = toggleBest(failed, "claude", T);
    expect(best).toMatchObject({ best: "claude", fail: [] });
    const back = toggleFail(best, "claude", T);
    expect(back).toMatchObject({ best: null, fail: ["claude"] });
  });

  it("최고 해제는 다른 서비스의 실패 표시를 건드리지 않는다", () => {
    const r = toggleBest(toggleFail(emptyRating(), "grok", T), "claude", T);
    expect(toggleBest(r, "claude", T)).toMatchObject({ best: null, fail: ["grok"] });
  });
});

describe("readRating / withRating", () => {
  it("저장 형식을 읽고, 이상한 값은 걸러 낸다", () => {
    expect(readRating({ [RATING_KEY]: { best: "claude", fail: ["grok", 3], at: T } })).toEqual({ best: "claude", fail: ["grok"], at: T });
    expect(readRating({ [RATING_KEY]: "x" })).toBeNull();
    expect(readRating({})).toBeNull();
    expect(readRating(null)).toBeNull();
  });

  it("평가를 붙이고 다른 키(_pii 등)는 그대로, 빈 평가면 키를 지운다", () => {
    const row = { claude: "a", _pii: { count: 1 } };
    const rated = withRating(row, { best: "claude", fail: [] });
    expect(rated).toEqual({ claude: "a", _pii: { count: 1 }, [RATING_KEY]: { best: "claude", fail: [] } });
    expect(withRating(rated, emptyRating())).toEqual(row);
    expect(row).not.toHaveProperty(RATING_KEY); // 원본 불변
  });

  it("isRated: ★ 또는 ✕가 하나라도 있어야 평가로 본다", () => {
    expect(isRated(emptyRating())).toBe(false);
    expect(isRated({ best: null, fail: ["a"] })).toBe(true);
    expect(isRated(null)).toBe(false);
  });
});
