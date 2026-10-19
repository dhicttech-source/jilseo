import { describe, expect, it } from "vitest";
import { serviceSchema, validateServices } from "./serviceSchema";

// 저장소의 services/*.json 전부 (vite의 glob import — node 타입 없이 동작)
const files = import.meta.glob("../../services/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

describe("services/*.json (저장소 전수 검사)", () => {
  it("JSON 파일이 있다", () => expect(Object.keys(files).length).toBeGreaterThan(0));
  for (const [path, json] of Object.entries(files)) {
    const f = path.split("/").pop()!;
    it(`${f} 스키마 통과`, () => {
      const r = serviceSchema.safeParse(json);
      expect(r.success, r.success ? "" : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")).toBe(true);
      expect((json as { id?: string }).id).toBe(f.replace(/\.json$/, ""));
    });
  }
});

describe("validateServices", () => {
  const ok = { id: "x", name: "X", url: "https://x.test", partition: "persist:x", selectors: { input: "#i", send: "#s", response: "#r" } };
  it("통과한 것은 services에, 실패는 errors에 파일·필드·사유로", () => {
    const bad = { ...ok, id: "Bad Id", url: "http://x.test", selectors: { input: "", send: "#s" } };
    const r = validateServices([ok, bad], (_, i) => `f${i}.json`);
    expect(r.services).toHaveLength(1);
    expect(r.errors.some((e) => e.startsWith("f1.json: id"))).toBe(true);
    expect(r.errors.some((e) => e.includes("url"))).toBe(true);
    expect(r.errors.some((e) => e.includes("selectors.input"))).toBe(true);
    expect(r.errors.some((e) => e.includes("selectors.response"))).toBe(true);
  });
  it("모르는 필드는 오류 (오타 방지)", () => {
    const r = validateServices([{ ...ok, selectors: { ...ok.selectors, genarating: "x" } }]);
    expect(r.services).toHaveLength(0);
    expect(r.errors[0]).toContain("genarating");
  });
  it("afterFileBroadcast·kind는 정해진 값만", () => {
    expect(validateServices([{ ...ok, kind: "bot" }]).errors[0]).toContain("kind");
    expect(validateServices([{ ...ok, afterFileBroadcast: "reload" }]).errors[0]).toContain("afterFileBroadcast");
    expect(validateServices([{ ...ok, kind: "web", afterFileBroadcast: "new_chat" }]).services).toHaveLength(1);
  });
});
