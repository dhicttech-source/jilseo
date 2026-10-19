import { describe, expect, it } from "vitest";
import { KEEP_DAYS, countToday, emptyUsage, overLimit, recordSend } from "./usage";

const DAY = 86_400_000;
const now = new Date(2026, 9, 19, 15, 0).getTime();

describe("recordSend / countToday", () => {
  it("전송 성공 시각을 서비스별로 쌓고 오늘 횟수를 센다", () => {
    let log = emptyUsage();
    log = recordSend(log, ["chatgpt", "claude"], now - 3600_000);
    log = recordSend(log, ["chatgpt"], now);
    expect(countToday(log, now)).toEqual({ chatgpt: 2, claude: 1 });
  });
  it("어제 기록은 오늘 횟수에 들어가지 않고, 30일 넘은 기록은 정리된다", () => {
    let log = emptyUsage();
    log = recordSend(log, ["gemini"], now - DAY); // 어제 같은 시각
    log = recordSend(log, ["grok"], now - (KEEP_DAYS + 1) * DAY);
    log = recordSend(log, ["gemini"], now);
    expect(countToday(log, now)).toEqual({ gemini: 1 });
    expect(log.sent.grok).toBeUndefined();
    expect(log.sent.gemini).toHaveLength(2);
  });
  it("원본을 바꾸지 않는다", () => {
    const log = emptyUsage();
    recordSend(log, ["a"], now);
    expect(log.sent).toEqual({});
  });
});

describe("overLimit", () => {
  it("한도가 0이거나 없으면 경고 없음, 도달·초과만 반환", () => {
    const today = { chatgpt: 10, claude: 3 };
    expect(overLimit(today, { chatgpt: 10, claude: 0 }, ["chatgpt", "claude", "gemini"])).toEqual([{ id: "chatgpt", count: 10, limit: 10 }]);
    expect(overLimit(today, {}, ["chatgpt"])).toEqual([]);
    expect(overLimit(today, { gemini: 1 }, ["gemini"])).toEqual([]);
  });
});
