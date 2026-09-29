import { describe, expect, it } from "vitest";
import type { ServiceDef } from "../adapters";
import { assignRole, effectiveRole, nextRole, resolvePipelineRoles } from "./roles";

const svc = (id: string, kind: "ai" | "web" = "ai"): ServiceDef => ({
  id,
  name: id,
  url: `https://${id}.test`,
  partition: `persist:${id}`,
  selectors: { input: "#i", send: "#s", response: "#r" },
  kind,
});
const services = [svc("chatgpt"), svc("claude"), svc("gemini"), svc("web-1", "web")];
const stage = ["chatgpt", "claude", "gemini", "web-1"];

describe("resolvePipelineRoles", () => {
  it("역할 미지정이면 첫 AI 패널이 생성, 나머지 AI 패널이 검증 (웹슬롯 제외)", () => {
    const r = resolvePipelineRoles(stage, {}, services);
    expect(r.generator?.id).toBe("chatgpt");
    expect(r.verifiers.map((v) => v.id)).toEqual(["claude", "gemini"]);
    expect(r.error).toBeUndefined();
  });

  it("명시 배정 시 미지정 패널은 검증으로 본다", () => {
    const r = resolvePipelineRoles(stage, { claude: "generate" }, services);
    expect(r.generator?.id).toBe("claude");
    expect(r.verifiers.map((v) => v.id)).toEqual(["chatgpt", "gemini"]);
  });

  it("제외된 패널은 검증에서 빠진다", () => {
    const r = resolvePipelineRoles(stage, { claude: "generate", gemini: "off" }, services);
    expect(r.verifiers.map((v) => v.id)).toEqual(["chatgpt"]);
  });

  it("생성이 없거나 2개면 실행 불가", () => {
    expect(resolvePipelineRoles(stage, { chatgpt: "verify" }, services).error).toBe("생성 패널을 지정하세요");
    expect(resolvePipelineRoles(stage, { chatgpt: "generate", claude: "generate" }, services).error).toBe("생성 패널은 1개만");
  });

  it("검증 패널이 없으면 실행 불가", () => {
    expect(resolvePipelineRoles(["chatgpt"], {}, services).error).toBe("검증 패널이 없습니다");
    expect(resolvePipelineRoles(stage, { chatgpt: "generate", claude: "off", gemini: "off" }, services).error).toBe("검증 패널이 없습니다");
  });

  it("스테이지가 비었거나 웹슬롯뿐이면 AI 패널 없음", () => {
    expect(resolvePipelineRoles([], {}, services).error).toBe("AI 패널이 없습니다");
    expect(resolvePipelineRoles(["web-1"], {}, services).error).toBe("AI 패널이 없습니다");
  });

  it("스테이지에 없는 서비스의 역할은 무시한다", () => {
    const r = resolvePipelineRoles(["chatgpt", "claude"], { grok: "generate" }, services);
    // grok은 스테이지에 없으므로 명시 배정으로 치지 않음 → 암묵 규칙
    expect(r.generator?.id).toBe("chatgpt");
  });
});

describe("assignRole", () => {
  it("암묵 상태에서 한 패널을 바꾸면 나머지는 현재 역할 그대로 굳는다", () => {
    const next = assignRole({}, stage, services, "gemini", "off");
    expect(next).toEqual({ chatgpt: "generate", claude: "verify", gemini: "off" });
  });

  it("새 생성 패널을 지정하면 기존 생성 패널은 검증으로 내려간다", () => {
    const next = assignRole({ chatgpt: "generate", claude: "verify", gemini: "verify" }, stage, services, "claude", "generate");
    expect(next.chatgpt).toBe("verify");
    expect(next.claude).toBe("generate");
    expect(Object.values(next).filter((r) => r === "generate")).toHaveLength(1);
  });
});

describe("effectiveRole / nextRole", () => {
  it("해석 결과로 패널의 현재 역할을 알 수 있다", () => {
    const r = resolvePipelineRoles(stage, {}, services);
    expect(effectiveRole("chatgpt", r)).toBe("generate");
    expect(effectiveRole("claude", r)).toBe("verify");
    expect(effectiveRole("web-1", r)).toBe("off");
  });

  it("생성 → 검증 → 제외 → 생성 순환", () => {
    expect(nextRole("generate")).toBe("verify");
    expect(nextRole("verify")).toBe("off");
    expect(nextRole("off")).toBe("generate");
  });
});
