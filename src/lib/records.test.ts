import { describe, expect, it } from "vitest";
import { emptyFilter, matchesFilter, readRecord, recordToMarkdown, summaryLine, withJudged } from "./records";
import type { ComparisonRow } from "./scorecard";

const verdict = (lens: string, grade: string, judged?: string) => ({ lens, grade, counts: { severe: 1, normal: 0, minor: 0 }, headline: ["지적 한 줄"], parsed: true, judged });
const NAMES: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini" };
const name = (id: string) => NAMES[id] ?? id;

const broadcast: ComparisonRow = {
  id: "b1",
  prompt: "서울 인구 추이를 요약해줘",
  responses: { chatgpt: "약 940만", claude: "감소 추세", _rating: { best: "claude", fail: ["chatgpt"] }, _pii: { count: 1, kinds: ["person"], attachment: "none" } },
  created_at: "2026-11-01T01:00:00Z",
  device: "studio",
};
const pipeline: ComparisonRow = {
  id: "p1",
  prompt: "보고서 검토",
  responses: {
    claude: "초안 본문",
    "revised:claude": "수정본 본문",
    "verify:gemini": "사실 검증 본문",
    "verify:chatgpt": "논리 검증 본문",
    _verdicts: { gemini: verdict("fact", "revise", "right"), chatgpt: verdict("logic", "trust") },
    _meta: { generator: "claude", presetId: "report", depth: "deep", verifiers: [{ id: "gemini", lens: "fact" }, { id: "chatgpt", lens: "logic" }] },
  },
  created_at: "2026-11-01T02:00:00Z",
};

describe("readRecord", () => {
  it("동시 전송: 응답·평가·가림 여부", () => {
    const d = readRecord(broadcast);
    expect(d.kind).toBe("broadcast");
    expect(d.answers.map((a) => a.serviceId)).toEqual(["chatgpt", "claude"]);
    expect(d.rating).toEqual({ best: "claude", fail: ["chatgpt"] });
    expect(d.masked).toBe(true);
    expect(d.device).toBe("studio");
  });

  it("파이프라인: 생성·검증(렌즈·판정)·수정본·메타", () => {
    const d = readRecord(pipeline);
    expect(d.kind).toBe("pipeline");
    expect(d.generator).toBe("claude");
    expect(d.answers).toEqual([{ serviceId: "claude", text: "초안 본문" }]);
    expect(d.verifiers.map((v) => [v.serviceId, v.lens, v.verdict?.grade])).toEqual([
      ["gemini", "fact", "revise"],
      ["chatgpt", "logic", "trust"],
    ]);
    expect(d.revised).toBe("수정본 본문");
    expect(d.depth).toBe("deep");
    expect(d.masked).toBe(false);
  });

  it("판정이 없는 검증은 메타의 렌즈를 쓴다", () => {
    const d = readRecord({ id: "x", responses: { claude: "a", "verify:gemini": "b", _meta: { generator: "claude", verifiers: [{ id: "gemini", lens: "risk" }] } } });
    expect(d.verifiers[0]).toMatchObject({ lens: "risk", verdict: null });
  });
});

describe("summaryLine", () => {
  it("동시 전송은 ★/✕, 미평가 표시", () => {
    expect(summaryLine(readRecord(broadcast), name)).toBe("★ Claude · ✕ ChatGPT");
    expect(summaryLine(readRecord({ id: "y", responses: { claude: "a" } }), name)).toBe("미평가");
  });
  it("파이프라인은 생성·등급 분포·채택 수", () => {
    expect(summaryLine(readRecord(pipeline), name)).toBe("Claude 생성 · 신뢰 가능 1 · 일부 수정 필요 1 · 채택 1/2");
  });
});

describe("matchesFilter", () => {
  const b = readRecord(broadcast);
  const p = readRecord(pipeline);

  it("검색: 프롬프트·응답·검증·수정본, 단어 모두 포함, 대소문자 무시", () => {
    expect(matchesFilter(b, { ...emptyFilter(), q: "서울 감소" })).toBe(true);
    expect(matchesFilter(p, { ...emptyFilter(), q: "수정본" })).toBe(true);
    expect(matchesFilter(p, { ...emptyFilter(), q: "서울" })).toBe(false);
  });

  it("종류 필터", () => {
    expect(matchesFilter(b, { ...emptyFilter(), kind: "pipeline" })).toBe(false);
    expect(matchesFilter(p, { ...emptyFilter(), kind: "pipeline" })).toBe(true);
  });

  it("성적표 칸에서 넘어온 조건: 서비스×렌즈, 생성 서비스, 동시 전송 서비스", () => {
    expect(matchesFilter(p, { ...emptyFilter(), service: "gemini", lens: "fact" })).toBe(true);
    expect(matchesFilter(p, { ...emptyFilter(), service: "gemini", lens: "logic" })).toBe(false);
    expect(matchesFilter(p, { ...emptyFilter(), generator: "claude" })).toBe(true);
    expect(matchesFilter(b, { ...emptyFilter(), generator: "claude" })).toBe(false);
    expect(matchesFilter(b, { ...emptyFilter(), service: "claude" })).toBe(true);
    expect(matchesFilter(b, { ...emptyFilter(), service: "gemini" })).toBe(false);
    expect(matchesFilter(b, { ...emptyFilter(), service: "claude", lens: "fact" })).toBe(false); // 동시 전송엔 렌즈가 없다
  });
});

describe("withJudged", () => {
  it("해당 검증자의 채택만 바꾸고 나머지 키는 유지", () => {
    const next = withJudged(pipeline.responses, "chatgpt", "wrong");
    const v = next._verdicts as Record<string, { judged?: string }>;
    expect(v.chatgpt.judged).toBe("wrong");
    expect(v.gemini.judged).toBe("right");
    expect(next["revised:claude"]).toBe("수정본 본문");
    expect((pipeline.responses._verdicts as Record<string, { judged?: string }>).chatgpt.judged).toBeUndefined(); // 원본 불변
  });
  it("판정이 없는 검증자면 그대로", () => {
    expect(withJudged(pipeline.responses, "grok", "right")).toBe(pipeline.responses);
  });
});

describe("recordToMarkdown", () => {
  it("동시 전송·파이프라인 모두 내보내기 형식", () => {
    const lensName = (id: string) => ({ fact: "사실", logic: "논리" })[id] ?? id;
    expect(recordToMarkdown(readRecord(broadcast), name, lensName)).toContain("## Claude\n\n감소 추세");
    const md = recordToMarkdown(readRecord(pipeline), name, lensName);
    expect(md).toContain("## 생성 — Claude");
    expect(md).toContain("## 검증 — Gemini · 사실 렌즈");
    expect(md).toContain("채택: 맞는 지적");
    expect(md).toContain("## 수정본 — Claude");
  });
});
