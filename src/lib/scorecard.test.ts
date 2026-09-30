import { describe, expect, it } from "vitest";
import { findPreset } from "./presets";
import { aggregate, extractVerdictRecords, recommend, type ComparisonRow } from "./scorecard";

const verdict = (lens: string, grade: string, severe = 0, judged?: string, parsed = true) => ({
  lens, grade, counts: { severe, normal: 0, minor: 0 }, headline: [], parsed, judged,
});
const row = (id: string, responses: Record<string, unknown>, created_at = "2026-09-30T00:00:00Z"): ComparisonRow => ({ id, responses, created_at });

const rows: ComparisonRow[] = [
  // 메타 있는 기록: chatgpt 생성, claude 논리(맞음), gemini 위험(틀림), perplexity 사실(보류)
  row("r1", {
    chatgpt: "답", "verify:claude": "..", "verify:gemini": "..", "verify:perplexity": "..",
    _verdicts: { claude: verdict("logic", "distrust", 3, "right"), gemini: verdict("risk", "revise", 2, "wrong"), perplexity: verdict("fact", "distrust", 3, "hold") },
    _meta: { presetId: "report", depth: "standard", generator: "chatgpt", verifiers: [] },
  }, "2026-09-29T00:00:00Z"),
  // 메타 없는 옛 기록: 생성 키 추론(claude), 수정본 있음
  row("r2", {
    claude: "답", "verify:gemini": "..", "revised:claude": "수정",
    _verdicts: { gemini: verdict("risk", "trust", 0, "right") },
  }),
  // 형식 불명 + 채택 없음
  row("r3", { claude: "답", "verify:gemini": "..", _verdicts: { gemini: verdict("risk", "unknown", 0, undefined, false) } }),
  // 동시 전송 기록(판정 없음) → 무시
  row("r4", { chatgpt: "a", claude: "b" }),
];

describe("extractVerdictRecords", () => {
  it("판정이 있는 행만, 메타의 생성 모델 또는 추론된 생성 모델을 붙인다", () => {
    const recs = extractVerdictRecords(rows);
    expect(recs).toHaveLength(5);
    expect(recs.find((r) => r.rowId === "r1")!.generator).toBe("chatgpt");
    expect(recs.find((r) => r.rowId === "r1")!.presetId).toBe("report");
    expect(recs.find((r) => r.rowId === "r2")!.generator).toBe("claude");
    expect(recs.find((r) => r.rowId === "r2")!.revised).toBe(true);
    expect(recs.find((r) => r.rowId === "r3")!.revised).toBe(false);
  });

  it("생성 키를 추론할 수 없으면 null", () => {
    const recs = extractVerdictRecords([row("x", { a: "1", b: "2", _verdicts: { gemini: verdict("risk", "trust") } })]);
    expect(recs[0].generator).toBeNull();
  });
});

describe("aggregate", () => {
  const card = aggregate(rows);

  it("렌즈×모델 셀: 실행·형식·등급·채택·정확도", () => {
    const g = card.byLensModel.risk.gemini;
    expect(g.runs).toBe(3);
    expect(g.parsed).toBe(2);
    expect(g.grades).toEqual({ trust: 1, revise: 1, distrust: 0, unknown: 1 });
    expect(g.right).toBe(1);
    expect(g.wrong).toBe(1);
    expect(g.accuracy).toBe(0.5);
    expect(card.byLensModel.fact.perplexity.accuracy).toBeNull(); // 보류만 있음
    expect(card.byLensModel.logic.claude.accuracy).toBe(1);
  });

  it("생성 모델: 실행 수(행 기준), 신뢰 비율(형식 불명 제외), 수정 수", () => {
    expect(card.byGenerator.chatgpt.runs).toBe(1);
    expect(card.byGenerator.chatgpt.trustRate).toBe(0); // distrust·revise·distrust
    expect(card.byGenerator.claude.runs).toBe(2);
    expect(card.byGenerator.claude.trustVotes).toBe(1);
    expect(card.byGenerator.claude.totalVotes).toBe(1); // r3의 unknown은 제외
    expect(card.byGenerator.claude.trustRate).toBe(1);
    expect(card.byGenerator.claude.revised).toBe(1);
  });

  it("행 수와 기간", () => {
    expect(card.rows).toBe(3);
    expect(card.from).toBe("2026-09-29T00:00:00Z");
    expect(card.to).toBe("2026-09-30T00:00:00Z");
  });

  it("빈 입력은 빈 성적표", () => {
    const c = aggregate([]);
    expect(c.rows).toBe(0);
    expect(c.from).toBeNull();
  });
});

describe("recommend", () => {
  const report = findPreset("report")!;
  const many: ComparisonRow[] = [];
  for (let i = 0; i < 4; i++) {
    many.push(row(`a${i}`, { chatgpt: "x", _verdicts: { claude: verdict("logic", "revise", 1, "right"), gemini: verdict("logic", "revise", 1, i === 0 ? "right" : "wrong"), perplexity: verdict("fact", "revise", 1, "right") }, _meta: { generator: "chatgpt", presetId: "report", depth: "standard", verifiers: [] } }));
  }
  const card = aggregate(many);

  it("표본 3건 이상인 후보 중 정확도 최고를 슬롯마다 추천, 같은 모델 중복 없음", () => {
    const rec = recommend(card, report, ["claude", "gemini", "perplexity"]);
    expect(rec[0]).toMatchObject({ lens: "fact", model: "perplexity", accuracy: 1, judged: 4 });
    expect(rec[1]).toMatchObject({ lens: "logic", model: "claude", accuracy: 1 });
    expect(rec[2]).toMatchObject({ lens: "risk", model: null, reason: "기록 부족" });
  });

  it("스테이지에 없는 모델은 추천하지 않는다", () => {
    const rec = recommend(card, report, ["gemini"]);
    expect(rec[1].model).toBe("gemini"); // logic: gemini 정확도 0.25지만 유일한 후보
    expect(rec[0].model).toBeNull(); // fact: perplexity 없음
  });

  it("표본 하한을 올리면 기록 부족", () => {
    expect(recommend(card, report, ["claude", "gemini", "perplexity"], 5).every((r) => r.model === null)).toBe(true);
  });
});
