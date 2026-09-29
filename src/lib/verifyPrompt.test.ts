import { describe, expect, it } from "vitest";
import { DEFAULT_VERIFY_TEMPLATE, MAX_ANSWER_CHARS, buildVerifyPrompt, truncateAnswer, verifyKey } from "./verifyPrompt";

describe("buildVerifyPrompt", () => {
  it("{question}과 {answer}를 치환한다", () => {
    const out = buildVerifyPrompt("Q: {question}\nA: {answer}", "왜?", "그래서");
    expect(out).toBe("Q: 왜?\nA: 그래서");
  });

  it("자리표시자가 여러 번 나와도 전부 치환한다", () => {
    expect(buildVerifyPrompt("{question} / {question} {answer}", "q", "a")).toBe("q / q a");
  });

  it("답변에 $나 정규식 특수문자가 있어도 그대로 들어간다", () => {
    expect(buildVerifyPrompt("{answer}", "q", "가격 $10 $& $1")).toBe("가격 $10 $& $1");
  });

  it("템플릿에 {answer}가 없으면 답변을 뒤에 붙인다", () => {
    const out = buildVerifyPrompt("검증해줘", "q", "답");
    expect(out).toContain("검증해줘");
    expect(out.endsWith("[답변]\n답")).toBe(true);
  });

  it("빈 템플릿이어도 답변은 반드시 포함된다", () => {
    expect(buildVerifyPrompt("", "q", "답")).toContain("답");
  });

  it("기본 템플릿은 두 자리표시자를 모두 가진다", () => {
    expect(DEFAULT_VERIFY_TEMPLATE).toContain("{question}");
    expect(DEFAULT_VERIFY_TEMPLATE).toContain("{answer}");
  });
});

describe("truncateAnswer", () => {
  it("상한 이하면 그대로", () => {
    expect(truncateAnswer("짧다", 10)).toBe("짧다");
  });

  it("상한을 넘으면 자르고 생략 표시를 붙인다", () => {
    const long = "a".repeat(MAX_ANSWER_CHARS + 500);
    const out = truncateAnswer(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out.startsWith("a".repeat(MAX_ANSWER_CHARS))).toBe(true);
    expect(out.endsWith("(이하 생략)")).toBe(true);
  });
});

describe("verifyKey", () => {
  it("검증 응답 키는 verify: 접두어", () => {
    expect(verifyKey("claude")).toBe("verify:claude");
  });
});
