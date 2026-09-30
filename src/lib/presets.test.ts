import { describe, expect, it } from "vitest";
import type { ServiceDef } from "../adapters";
import { BUILTIN_PRESETS, applyPreset, depthOf, findPreset, limitByDepth, sortByLensOrder } from "./presets";

const svc = (id: string, kind: "ai" | "web" = "ai"): ServiceDef => ({
  id, name: id, url: `https://${id}.test`, partition: `persist:${id}`, selectors: { input: "#i", send: "#s", response: "#r" }, kind,
});
const services = ["chatgpt", "claude", "gemini", "perplexity", "grok"].map((id) => svc(id)).concat(svc("web-1", "web"));

describe("BUILTIN_PRESETS", () => {
  it("5종, id 고유, 슬롯 렌즈는 알려진 렌즈", () => {
    expect(BUILTIN_PRESETS).toHaveLength(5);
    expect(new Set(BUILTIN_PRESETS.map((p) => p.id)).size).toBe(5);
    for (const p of BUILTIN_PRESETS) for (const s of p.slots) expect(["fact", "logic", "risk", "strength", "improve", "code", "bias"]).toContain(s.lens);
  });
});

describe("applyPreset", () => {
  const report = findPreset("report")!;

  it("보고서: 생성 유지, 사실은 검색 서비스, 논리·위험은 추론 서비스, 남는 패널 제외", () => {
    const r = applyPreset(report, ["claude", "gemini", "perplexity", "chatgpt", "web-1"], services, "chatgpt");
    expect(r.generator).toBe("chatgpt");
    expect(r.lensAssign).toEqual({ perplexity: "fact", claude: "logic", gemini: "risk" });
    expect(r.roles).toEqual({ chatgpt: "generate", perplexity: "verify", claude: "verify", gemini: "verify" });
    expect(r.leftover).toEqual([]);
  });

  it("생성 패널은 검증에 배정되지 않고, 선호 서비스가 생성이면 다음 선호로", () => {
    const r = applyPreset(report, ["perplexity", "claude", "gemini"], services, "perplexity");
    expect(r.lensAssign.perplexity).toBeUndefined();
    // 사실 슬롯: perplexity(생성)·grok·chatgpt 없음 → 남은 패널 첫 번째(claude)
    expect(r.assigned[0]).toBe("claude");
    expect(r.lensAssign.claude).toBe("fact");
  });

  it("생성 지정이 없거나 스테이지에 없으면 첫 AI 패널이 생성", () => {
    expect(applyPreset(report, ["web-1", "gemini", "claude"], services, null).generator).toBe("gemini");
    expect(applyPreset(report, ["gemini", "claude"], services, "grok").generator).toBe("gemini");
  });

  it("패널이 슬롯보다 적으면 앞 슬롯만 채운다", () => {
    const r = applyPreset(report, ["chatgpt", "claude"], services, "chatgpt");
    expect(r.assigned).toEqual(["claude"]);
    expect(r.lensAssign).toEqual({ claude: "fact" });
  });

  it("패널이 슬롯보다 많으면 남는 패널은 제외(off)", () => {
    const quick = findPreset("quick")!;
    const r = applyPreset(quick, ["chatgpt", "claude", "gemini", "perplexity"], services, "chatgpt");
    expect(r.assigned).toEqual(["claude"]);
    expect(r.leftover.sort()).toEqual(["gemini", "perplexity"]);
    expect(r.roles.gemini).toBe("off");
  });

  it("같은 렌즈 슬롯 두 개(코드)는 서로 다른 패널에 간다", () => {
    const r = applyPreset(findPreset("code")!, ["gemini", "claude", "chatgpt"], services, "gemini");
    expect(r.assigned).toEqual(["claude", "chatgpt"]);
    expect(r.lensAssign).toEqual({ claude: "code", chatgpt: "code" });
  });

  it("AI 패널이 없으면 아무것도 배정하지 않는다", () => {
    const r = applyPreset(report, ["web-1"], services, null);
    expect(r.generator).toBeNull();
    expect(r.assigned).toEqual([]);
  });
});

describe("limitByDepth", () => {
  const v = ["a", "b", "c", "d"];
  it("빠름은 1개, 표준은 3개, 심층은 전부", () => {
    expect(limitByDepth(v, "quick", (x) => x)).toEqual(["a"]);
    expect(limitByDepth(v, "standard", (x) => x)).toEqual(["a", "b", "c"]);
    expect(limitByDepth(v, "deep", (x) => x)).toEqual(v);
  });
  it("선호 순서에 있는 것을 먼저 남기되 원래 순서로 돌려준다", () => {
    expect(limitByDepth(v, "standard", (x) => x, ["d", "c"])).toEqual(["a", "c", "d"]);
    expect(limitByDepth(v, "quick", (x) => x, ["c"])).toEqual(["c"]);
  });
  it("상한 이하면 그대로", () => {
    expect(limitByDepth(["a"], "quick", (x) => x)).toEqual(["a"]);
  });
});

describe("sortByLensOrder / depthOf", () => {
  it("강점 → 사실 → 논리 → 위험 → 개선 → 코드 → 편향 → 종합, 모르는 렌즈는 맨 뒤, 같은 순위는 원래 순서", () => {
    const items = [{ l: "composite" }, { l: "risk" }, { l: "mine" }, { l: "fact" }, { l: "risk", k: 2 }];
    expect(sortByLensOrder(items, (x) => x.l).map((x) => x.l + (x.k ?? ""))).toEqual(["fact", "risk", "risk2", "composite", "mine"]);
  });
  it("모르는 깊이는 표준", () => {
    expect(depthOf(undefined).id).toBe("standard");
    expect(depthOf("nope").id).toBe("standard");
    expect(depthOf("deep").maxVerifiers).toBe(Infinity);
  });
});
