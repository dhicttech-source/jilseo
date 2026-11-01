import { describe, expect, it } from "vitest";
import { commonPoints, gradeDistribution, similarity } from "./consensus";

describe("gradeDistribution", () => {
  it("등급 순서대로 개수, 전송 실패는 제외", () => {
    expect(
      gradeDistribution([
        { grade: "revise", sent: true },
        { grade: "trust", sent: true },
        { grade: "trust", sent: true },
        { grade: "distrust", sent: false },
      ]),
    ).toBe("신뢰 2 · 수정 1");
    expect(gradeDistribution([])).toBe("");
  });
});

describe("similarity", () => {
  it("같은 문장은 1, 공백·문장부호 차이는 무시", () => {
    expect(similarity("매출 증가율 근거가 없다", "매출 증가율, 근거가 없다.")).toBe(1);
  });
  it("관련 없는 문장은 낮다", () => {
    expect(similarity("매출 증가율 근거가 없다", "코드 예시가 오래된 문법을 쓴다")).toBeLessThan(0.2);
  });
});

describe("commonPoints", () => {
  const items = [
    { serviceId: "claude", headline: ["2025년 매출 증가율의 출처가 제시되지 않음", "결론이 성급함"] },
    { serviceId: "gemini", headline: ["매출 증가율 출처가 제시되지 않았다", "용어 정의가 없음"] },
    { serviceId: "perplexity", headline: ["2025년 매출 증가율 출처 미제시", "표의 단위가 빠짐"] },
  ];

  it("서로 다른 검증자 둘 이상이 비슷하게 쓴 핵심 줄만 묶는다", () => {
    const pts = commonPoints(items);
    expect(pts).toHaveLength(1);
    expect(pts[0].text).toBe("2025년 매출 증가율의 출처가 제시되지 않음");
    expect(pts[0].by.sort()).toEqual(["claude", "gemini", "perplexity"]);
  });

  it("같은 검증자의 비슷한 두 줄은 공통 지적이 아니다", () => {
    expect(commonPoints([{ serviceId: "claude", headline: ["출처가 제시되지 않음", "출처가 제시되지 않았음"] }])).toEqual([]);
  });

  it("너무 짧은 줄과 빈 입력은 무시", () => {
    expect(commonPoints([{ serviceId: "a", headline: ["없음"] }, { serviceId: "b", headline: ["없음"] }])).toEqual([]);
    expect(commonPoints([])).toEqual([]);
  });
});
