import { describe, expect, it } from "vitest";
import { DEFAULT_REVISE_TEMPLATE, buildRevisePrompt, formatVerdicts, revisedKey } from "./revise";

const v = (name: string, lensName: string, text: string) => ({ name, lensName, text });

describe("formatVerdicts", () => {
  it("검토자 번호·이름·렌즈를 붙여 나열하고 빈 판정은 뺀다", () => {
    const out = formatVerdicts([v("Claude", "논리", "전제가 약함"), v("Gemini", "위험", "   "), v("Perplexity", "사실", "출처 없음")]);
    expect(out).toBe("[검토자 1: Claude · 논리 렌즈]\n전제가 약함\n\n[검토자 2: Perplexity · 사실 렌즈]\n출처 없음");
  });

  it("검증자당 상한을 넘으면 자르고 생략 표시", () => {
    const out = formatVerdicts([v("A", "위험", "x".repeat(50))], 10);
    expect(out).toContain("x".repeat(10) + "\n…(이하 생략)");
    expect(out).not.toContain("x".repeat(11));
  });
});

describe("buildRevisePrompt", () => {
  it("{verdicts}를 치환한다", () => {
    const out = buildRevisePrompt("검토:\n{verdicts}\n끝", [v("A", "논리", "지적 1")]);
    expect(out).toBe("검토:\n[검토자 1: A · 논리 렌즈]\n지적 1\n끝");
  });

  it("자리표시자가 없는 템플릿에는 판정을 뒤에 붙인다", () => {
    const out = buildRevisePrompt("수정해 주세요", [v("A", "논리", "지적")]);
    expect(out!.startsWith("수정해 주세요\n\n[검토자 1")).toBe(true);
  });

  it("판정이 전부 비면 null", () => {
    expect(buildRevisePrompt(DEFAULT_REVISE_TEMPLATE, [v("A", "논리", ""), v("B", "위험", " ")])).toBeNull();
    expect(buildRevisePrompt(DEFAULT_REVISE_TEMPLATE, [])).toBeNull();
  });

  it("기본 템플릿은 동의하지 않는 지적 유지 조항과 바뀐 점 요약 지시를 가진다", () => {
    expect(DEFAULT_REVISE_TEMPLATE).toContain("{verdicts}");
    expect(DEFAULT_REVISE_TEMPLATE).toContain("동의하지 않는 지적");
    expect(DEFAULT_REVISE_TEMPLATE).toContain("바뀐 점");
  });

  it("판정에 $ 같은 치환 특수문자가 있어도 그대로", () => {
    expect(buildRevisePrompt("{verdicts}", [v("A", "사실", "$1 $& 값")])).toContain("$1 $& 값");
  });
});

describe("revisedKey", () => {
  it("revised: 접두어", () => {
    expect(revisedKey("claude")).toBe("revised:claude");
  });
});
