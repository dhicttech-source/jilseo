import { describe, expect, it } from "vitest";
import {
  BUILTIN_LENSES,
  COMPOSITE_LENS_ID,
  VERDICT_MARK,
  buildLensPrompt,
  parseVerdict,
  resolveLens,
  type Lens,
} from "./lenses";

describe("BUILTIN_LENSES", () => {
  it("내장 렌즈 8개, id 중복 없음, 종합 렌즈 포함", () => {
    expect(BUILTIN_LENSES).toHaveLength(8);
    expect(new Set(BUILTIN_LENSES.map((l) => l.id)).size).toBe(8);
    expect(BUILTIN_LENSES.some((l) => l.id === COMPOSITE_LENS_ID)).toBe(true);
  });

  it("모든 내장 렌즈 템플릿은 {question}과 {answer}를 가진다", () => {
    for (const l of BUILTIN_LENSES) {
      expect(l.template, l.id).toContain("{question}");
      expect(l.template, l.id).toContain("{answer}");
    }
  });
});

describe("buildLensPrompt", () => {
  it("판정 블록이 없는 템플릿에는 블록을 덧붙인다", () => {
    const lens = resolveLens("risk", {}, []);
    const out = buildLensPrompt(lens, "q", "a");
    expect(out).toContain(VERDICT_MARK);
    expect(out).toContain("등급:");
    expect(out.indexOf("a")).toBeLessThan(out.indexOf(VERDICT_MARK));
  });

  it("템플릿에 이미 판정 블록이 있으면 중복 추가하지 않는다", () => {
    const lens: Lens = { ...resolveLens("risk", {}, []), template: `{question}\n{answer}\n${VERDICT_MARK}\n등급: x` };
    const out = buildLensPrompt(lens, "q", "a");
    expect(out.split(VERDICT_MARK)).toHaveLength(2);
  });
});

describe("resolveLens", () => {
  it("모르는 id나 undefined는 종합 렌즈", () => {
    expect(resolveLens(undefined, {}, []).id).toBe(COMPOSITE_LENS_ID);
    expect(resolveLens("nope", {}, []).id).toBe(COMPOSITE_LENS_ID);
  });

  it("덮어쓰기가 있으면 템플릿만 바뀌고 나머지는 내장 그대로", () => {
    const l = resolveLens("fact", { fact: "내 템플릿 {question} {answer}" }, []);
    expect(l.template).toBe("내 템플릿 {question} {answer}");
    expect(l.name).toBe("사실");
    expect(l.builtin).toBe(true);
  });

  it("빈 덮어쓰기는 무시한다", () => {
    expect(resolveLens("fact", { fact: "   " }, []).template).toContain("사실 검증");
  });

  it("사용자 렌즈를 찾고 덮어쓰기도 적용된다", () => {
    const custom: Lens = { id: "mine", name: "내 렌즈", icon: "★", description: "", template: "{question}{answer}", recommended: [], builtin: false };
    expect(resolveLens("mine", {}, [custom]).name).toBe("내 렌즈");
    expect(resolveLens("mine", { mine: "덮어씀 {question}{answer}" }, [custom]).template).toBe("덮어씀 {question}{answer}");
  });
});

describe("parseVerdict", () => {
  it("정상 블록: 등급·건수·핵심 3줄", () => {
    const v = parseVerdict(
      `앞부분 설명...\n\n=== 판정 ===\n등급: 일부 수정 필요\n지적: 심각 1 / 보통 2 / 경미 0\n핵심:\n- 첫째 지적\n- 둘째 지적\n- 셋째 지적\n- 넷째는 무시`,
      "risk",
    );
    expect(v.parsed).toBe(true);
    expect(v.grade).toBe("revise");
    expect(v.counts).toEqual({ severe: 1, normal: 2, minor: 0 });
    expect(v.headline).toEqual(["첫째 지적", "둘째 지적", "셋째 지적"]);
    expect(v.lens).toBe("risk");
  });

  it("마크다운 강조·이스케이프·인용이 섞여도 읽는다", () => {
    const v = parseVerdict(
      `\\=== 판정 \\===\n**등급:** **신뢰 가능**\n> 지적: 심각 **0** / 보통 1 / 경미 3\n### 핵심:\n1. *한 줄*\n2. \\[둘째\\]`,
      "fact",
    );
    expect(v.grade).toBe("trust");
    expect(v.counts).toEqual({ severe: 0, normal: 1, minor: 3 });
    expect(v.headline).toEqual(["한 줄", "[둘째]"]);
  });

  it("판정 마크 없이 본문 끝에 등급만 있어도 읽는다", () => {
    const v = parseVerdict(`긴 설명\n\n등급: 신뢰 불가\n핵심: 근거 없음`, "logic");
    expect(v.parsed).toBe(true);
    expect(v.grade).toBe("distrust");
    expect(v.headline).toEqual(["근거 없음"]);
  });

  it("형식이 없으면 parsed=false, grade=unknown, 건수 0", () => {
    const v = parseVerdict("그냥 자유 서술만 있는 응답입니다.", "risk");
    expect(v.parsed).toBe(false);
    expect(v.grade).toBe("unknown");
    expect(v.counts).toEqual({ severe: 0, normal: 0, minor: 0 });
    expect(v.headline).toEqual([]);
  });

  it("건수 줄이 빠지면 0으로, 자리표시자를 그대로 돌려준 핵심 줄은 버린다", () => {
    const v = parseVerdict(`=== 판정 ===\n등급: 신뢰 가능\n핵심:\n- (가장 중요한 지적 한 줄)\n- 실제 지적`, "fact");
    expect(v.counts).toEqual({ severe: 0, normal: 0, minor: 0 });
    expect(v.headline).toEqual(["실제 지적"]);
  });

  it("빈 문자열도 안전", () => {
    expect(parseVerdict("", "fact").parsed).toBe(false);
  });
});

describe("buildLensPrompt 길이 지시", () => {
  it("길이 지시는 본문 뒤, 판정 블록 앞에 들어간다", () => {
    const lens = resolveLens("risk", {}, []);
    const out = buildLensPrompt(lens, "q", "a", "5줄 이내");
    expect(out.indexOf("5줄 이내")).toBeGreaterThan(out.indexOf("a"));
    expect(out.indexOf("5줄 이내")).toBeLessThan(out.indexOf(VERDICT_MARK));
  });
  it("빈 지시는 무시", () => {
    const lens = resolveLens("risk", {}, []);
    expect(buildLensPrompt(lens, "q", "a", "  ")).toBe(buildLensPrompt(lens, "q", "a"));
  });
});
