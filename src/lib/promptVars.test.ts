import { describe, expect, it } from "vitest";
import { composePrompt, extractVars, fillVars, hasVars } from "./promptVars";

describe("extractVars", () => {
  it("등장 순서, 중복 제거, 공백 무시", () => {
    expect(extractVars("{{문서종류}}를 {{ 대상 }}에게 {{문서종류}} 기준 {{분량}}")).toEqual(["문서종류", "대상", "분량"]);
  });
  it("한 겹 중괄호(렌즈 자리표시자)와 빈 변수는 무시", () => {
    expect(extractVars("{question} {answer} {{}} {{ }}")).toEqual([]);
    expect(hasVars("그냥 글")).toBe(false);
  });
});

describe("fillVars", () => {
  it("값을 넣고, 비어 있는 값은 자리표시자를 남긴다", () => {
    expect(fillVars("{{a}}-{{ b }}-{{c}}", { a: "1", b: "2" })).toBe("1-2-{{c}}");
  });
  it("$ 특수문자 안전", () => {
    expect(fillVars("가격 {{p}}", { p: "$10 $& $1" })).toBe("가격 $10 $& $1");
  });
});

describe("composePrompt", () => {
  it("접두어가 있으면 빈 줄 하나로 결합, 없으면 본문만", () => {
    expect(composePrompt("항상 한국어로.", " 질문 ")).toBe("항상 한국어로.\n\n질문");
    expect(composePrompt("  ", "질문")).toBe("질문");
    expect(composePrompt(undefined, "질문")).toBe("질문");
    expect(composePrompt("접두어만", "")).toBe("접두어만");
  });
});
