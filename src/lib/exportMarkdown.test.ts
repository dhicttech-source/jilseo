import { describe, expect, it } from "vitest";
import { broadcastToMarkdown, exportStamp, pipelineToMarkdown } from "./exportMarkdown";

const at = new Date(2026, 9, 19, 14, 32).getTime();

describe("pipelineToMarkdown", () => {
  it("질문·생성·검증(판정 블록 인용)·수정본 순서, 메타 한 줄", () => {
    const md = pipelineToMarkdown({
      prompt: "Q?",
      generatorName: "Claude",
      answer: "A.",
      verifiers: [
        { name: "Gemini", lensName: "위험", sent: true, text: "지적 본문", verdict: { lens: "risk", grade: "revise", counts: { severe: 1, normal: 2, minor: 0 }, headline: ["h1", "h2"], parsed: true, judged: "right" } },
        { name: "ChatGPT", lensName: "코드", sent: false, text: "" },
      ],
      revised: "수정된 답",
      presetName: "보고서·문서",
      depthLabel: "표준",
      at,
    });
    expect(md.startsWith("# 질서 비교 기록 (생성 → 검증)\n2026-10-19 14:32 · 프리셋 보고서·문서 · 깊이 표준\n")).toBe(true);
    const order = ["## 질문", "Q?", "## 생성 — Claude", "A.", "## 검증 — Gemini · 위험 렌즈", "> 등급 **일부 수정 필요** · 지적 심각 1 / 보통 2 / 경미 0 · 채택: 맞는 지적", "> - h1", "지적 본문", "## 검증 — ChatGPT · 코드 렌즈", "(전송 실패)", "## 수정본 — Claude", "수정된 답"];
    let pos = -1;
    for (const s of order) {
      const i = md.indexOf(s, pos + 1);
      expect(i, s).toBeGreaterThan(pos);
      pos = i;
    }
    expect(md.endsWith("\n")).toBe(true);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("수정본·판정이 없으면 해당 절을 생략하고, 임시 전송 표시가 붙는다", () => {
    const md = pipelineToMarkdown({ prompt: "Q", generatorName: "G", answer: "", verifiers: [{ name: "V", lensName: "종합", sent: true, text: "t" }], at, ephemeral: true });
    expect(md).toContain("기록 안 함(임시 전송)");
    expect(md).toContain("(응답 없음)");
    expect(md).not.toContain("## 수정본");
    expect(md).not.toContain("> 등급");
  });
});

describe("broadcastToMarkdown / exportStamp", () => {
  it("질문 뒤 서비스별 절", () => {
    const md = broadcastToMarkdown({ prompt: "Q", responses: [{ name: "A", text: "a" }, { name: "B", text: "" }], at });
    expect(md).toContain("# 질서 비교 기록 (동시 전송)\n2026-10-19 14:32\n");
    expect(md.indexOf("## A")).toBeLessThan(md.indexOf("## B"));
    expect(md).toContain("(응답 없음)");
  });
  it("파일명용 시각", () => {
    expect(exportStamp(at)).toBe("2026-10-19_1432");
  });
});
