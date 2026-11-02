import { describe, expect, it } from "vitest";
import { formatBytes, isSaved, mergeRecords, readRecordsFile, rowsFromQueue, saveLabel, touch, updatedAt, type LocalRecord, type MergeInput } from "./localRecords";

const row = (id: string, at = 0, extra: Partial<LocalRecord> = {}): LocalRecord => ({
  id,
  prompt: `q-${id}`,
  created_at: `2026-11-0${id.length}T00:00:00Z`,
  responses: at ? { chatgpt: id, _updatedAt: at } : { chatgpt: id },
  ...extra,
});

const merge = (p: Partial<MergeInput>) =>
  mergeRecords({ local: [], remote: [], remoteComplete: true, pendingWrites: new Set(), pendingDeletes: new Set(), ...p });

describe("mergeRecords", () => {
  it("한쪽에만 있는 기록은 모두 남고, 서버에서 온 기록은 synced", () => {
    const r = merge({ local: [row("a")], remote: [row("bb")] });
    expect(r.rows.map((x) => x.id).sort()).toEqual(["a", "bb"]);
    expect(r.rows.find((x) => x.id === "bb")?.synced).toBe(true);
  });

  it("Supabase 연결 전에 쌓인 이 기기 기록은 올릴 목록에 들어감", () => {
    const r = merge({ local: [row("a")], remote: [] });
    expect(r.toUpload.map((x) => x.id)).toEqual(["a"]);
  });

  it("대기열에 있는 기록은 다시 올리지 않음", () => {
    const r = merge({ local: [row("a")], pendingWrites: new Set(["a"]) });
    expect(r.toUpload).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("양쪽에서 고쳤으면 _updatedAt이 늦은 쪽", () => {
    const local = row("a", 200, { synced: true, responses: { chatgpt: "이 기기", _updatedAt: 200 } });
    const remote = { ...row("a"), responses: { chatgpt: "다른 기기", _updatedAt: 100 } };
    expect(merge({ local: [local], remote: [remote] }).rows[0].responses.chatgpt).toBe("이 기기");
    const newer = { ...remote, responses: { chatgpt: "다른 기기", _updatedAt: 300 } };
    expect(merge({ local: [local], remote: [newer] }).rows[0].responses.chatgpt).toBe("다른 기기");
  });

  it("수정 시각이 같거나 없으면 서버 쪽", () => {
    const local = { ...row("a"), synced: true, responses: { chatgpt: "옛 내용" } };
    const remote = { ...row("a"), responses: { chatgpt: "서버" } };
    expect(merge({ local: [local], remote: [remote] }).rows[0].responses.chatgpt).toBe("서버");
  });

  it("서버에 있던 기록이 서버에서 사라지면 다른 기기에서 지운 것으로 보고 이 기기에서도 지움", () => {
    const r = merge({ local: [row("a", 0, { synced: true })], remote: [] });
    expect(r.rows).toEqual([]);
    expect(r.removed).toBe(1);
  });

  it("서버 목록을 끝까지 못 받았으면 지우지 않음", () => {
    const r = merge({ local: [row("a", 0, { synced: true })], remote: [], remoteComplete: false });
    expect(r.rows).toHaveLength(1);
    expect(r.removed).toBe(0);
  });

  it("서버에 있던 기록이라도 이 기기에서 고친 내용이 대기열에 있으면 지우지 않음", () => {
    const r = merge({ local: [row("a", 0, { synced: true })], remote: [], pendingWrites: new Set(["a"]) });
    expect(r.rows).toHaveLength(1);
  });

  it("이 기기에서 지우고 삭제가 대기열에 있으면 서버 기록을 다시 가져오지 않음", () => {
    expect(merge({ remote: [row("a")], pendingDeletes: new Set(["a"]) }).rows).toEqual([]);
  });

  it("이 기기 기록만 지우면 다음 동기화 때 서버 기록이 돌아오고, 모두 지우면 돌아오지 않음", () => {
    const server = [row("a"), row("bb")];
    expect(merge({ local: [], remote: server }).rows).toHaveLength(2); // 이 기기만 지움
    expect(merge({ local: [], remote: [] }).rows).toHaveLength(0); // 서버까지 지움
  });

  it("최근 순 정렬", () => {
    const r = merge({ local: [row("a"), row("ccc")], remote: [row("bb")] });
    expect(r.rows.map((x) => x.id)).toEqual(["ccc", "bb", "a"]);
  });
});

describe("readRecordsFile", () => {
  it("모양이 다르면 빈 파일, id·responses 없는 행은 버림", () => {
    expect(readRecordsFile(null).rows).toEqual([]);
    expect(readRecordsFile({ rows: "x" }).rows).toEqual([]);
    expect(readRecordsFile({ rows: [row("a"), { id: 1 }, { id: "b" }, null] }).rows.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("touch / updatedAt", () => {
  it("수정 시각을 찍고 읽음, 없으면 0", () => {
    expect(updatedAt({ responses: touch({ a: 1 }, 123) })).toBe(123);
    expect(updatedAt({ responses: {} })).toBe(0);
  });
});

describe("saveLabel / isSaved / formatBytes", () => {
  it("저장 상태 문구와 판정", () => {
    expect(saveLabel("local")).toBe("이 기기에 저장");
    expect(saveLabel("skipped")).toBe("기록 안 함");
    expect(isSaved("local")).toBe(true);
    expect(isSaved("skipped")).toBe(false);
    expect(isSaved(undefined)).toBe(false);
  });

  it("파일 크기 표기", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("rowsFromQueue", () => {
  it("대기열의 insert·update·delete를 순서대로 재생해 기록을 옮겨 옴", () => {
    const rows = rowsFromQueue([
      { op: "insert", row: { id: "a", prompt: "q1", responses: { chatgpt: "1" }, created_at: "2026-11-01T00:00:00Z", device: "mac" } },
      { op: "insert", row: { id: "b", prompt: "q2", responses: { chatgpt: "2" }, created_at: "2026-11-02T00:00:00Z" } },
      { op: "update", row: { id: "a", responses: { chatgpt: "1", _rating: { best: "chatgpt", fail: [] } } } },
      { op: "delete", row: { id: "b" } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "a", prompt: "q1", device: "mac", responses: { _rating: { best: "chatgpt" } } });
  });

  it("insert 없이 온 update, id 없는 항목은 무시하고 최근 순", () => {
    const rows = rowsFromQueue([
      { op: "update", row: { id: "x", responses: {} } },
      { op: "insert", row: { prompt: "no id", responses: {} } },
      { op: "insert", row: { id: "old", responses: {}, created_at: "2026-10-01T00:00:00Z" } },
      { op: "insert", row: { id: "new", responses: {}, created_at: "2026-11-01T00:00:00Z" } },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
