import { useCloud } from "../store/cloud";
import { isCloudUnreachable, UNREACHABLE_MESSAGE } from "./cloudError";
import { mergeRecords, readRecordsFile, rowsFromQueue, touch, type LocalRecord, type RecordsFile, type SaveResult } from "./localRecords";
import type { ComparisonRow } from "./scorecard";
import { readStore, storeInfo, writeStore, type StoreInfo } from "./store";
import { deleteOrQueue, dropQueued, getClient, queuedIds, queuedItems, saveRow, tableName, updateOrQueue } from "./supabase";

/**
 * 비교 기록 저장의 단일 입구. 항상 이 기기 파일(comparisons.json)에 먼저 쓰고,
 * Supabase가 설정돼 있으면 지금처럼 서버에도 올린다(실패하면 대기열). 🔒 임시 전송은 호출하는 쪽이 부르지 않는다.
 */

const COLUMNS = "id,prompt,responses,created_at,device";
const PAGE = 500;
/** 서버에서 받는 최대 쪽수. 넘으면 목록이 불완전한 것으로 보고 삭제 판단을 하지 않는다 */
const MAX_PAGES = 40;

let cache: RecordsFile | null = null;
let chain: Promise<unknown> = Promise.resolve();

/** 파일 읽기-수정-쓰기를 한 줄로 세운다 (평가를 연달아 눌러도 앞의 변경이 덮이지 않게) */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}

async function load(): Promise<RecordsFile> {
  if (cache) return cache;
  const raw = await readStore("comparisons").catch(() => null);
  if (raw !== null) return (cache = readRecordsFile(raw));
  // 파일이 처음 생기는 경우: 대기열에만 있던 기록을 옮겨 와 저장해 둔다 (Supabase에 이미 있는 기록은 첫 동기화 때 내려온다)
  const seeded = rowsFromQueue(await queuedItems("comparisons").catch(() => []));
  await persist(seeded);
  return cache!;
}

async function persist(rows: LocalRecord[]) {
  cache = { version: 1, rows };
  await writeStore("comparisons", cache);
}

/** 이 기기의 행 하나를 바꾼다 (없으면 그대로) */
const editLocal = (id: string, fn: (r: LocalRecord) => LocalRecord) =>
  serial(async () => {
    const f = await load();
    if (f.rows.some((r) => r.id === id)) await persist(f.rows.map((r) => (r.id === id ? fn(r) : r)));
  });

const cloudConfigured = () => !!useCloud.getState().config();

export async function listComparisons(): Promise<LocalRecord[]> {
  return serial(async () => (await load()).rows);
}

/** 새 기록: 이 기기 → (설정돼 있으면) 서버. 반환: saved | queued | local */
export async function saveComparison(row: { id: string; prompt: string; responses: Record<string, unknown>; device?: string | null }): Promise<SaveResult> {
  const rec: LocalRecord = { ...row, responses: touch(row.responses), created_at: new Date().toISOString() };
  await serial(async () => {
    const f = await load();
    await persist([rec, ...f.rows.filter((r) => r.id !== rec.id)]);
  });
  if (!cloudConfigured()) return "local";
  const cloud = useCloud.getState();
  const { synced: _s, ...upload } = rec;
  const res = await saveRow(cloud.config(), cloud.user, "comparisons", upload);
  if (res === "saved") await editLocal(rec.id, (r) => ({ ...r, synced: true }));
  void cloud.flush();
  return res;
}

/** 평가·채택·수정본 반영: responses 전체를 바꾸고 수정 시각을 찍는다 */
export async function updateComparison(id: string, responses: Record<string, unknown>): Promise<SaveResult> {
  const next = touch(responses);
  await editLocal(id, (r) => ({ ...r, responses: next }));
  if (!cloudConfigured()) return "local";
  const cloud = useCloud.getState();
  const res = await updateOrQueue(cloud.config(), "comparisons", id, { responses: next });
  void cloud.flush();
  return res;
}

export async function deleteComparison(id: string): Promise<SaveResult> {
  await serial(async () => {
    const f = await load();
    await persist(f.rows.filter((r) => r.id !== id));
  });
  if (!cloudConfigured()) return "local";
  const cloud = useCloud.getState();
  const res = await deleteOrQueue(cloud.config(), "comparisons", id);
  void cloud.flush();
  return res;
}

export interface SyncResult {
  rows: LocalRecord[];
  /** 다른 기기에서 지워져 이 기기에서도 지운 개수 */
  removed: number;
  /** Supabase 연결 전 기록을 올린 개수 */
  uploaded: number;
}

/** 서버 기록을 모두 받아(쪽 단위) 이 기기 기록과 합치고 파일을 갱신한다. 로그인 상태에서만. 실패하면 Error(문구) */
export async function syncComparisons(): Promise<SyncResult> {
  const cloud = useCloud.getState();
  const c = getClient(cloud.config());
  if (!c || cloud.status !== "signed_in") throw new Error("Supabase 로그인 상태가 아닙니다");
  const remote: ComparisonRow[] = [];
  let complete = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error, status } = await c
      .from(tableName("comparisons"))
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(isCloudUnreachable({ message: error.message, status }) ? UNREACHABLE_MESSAGE : `동기화 실패: ${error.message}`);
    remote.push(...((data ?? []) as ComparisonRow[]));
    if ((data?.length ?? 0) < PAGE) {
      complete = true;
      break;
    }
  }
  const { writes, deletes } = await queuedIds("comparisons");
  const merged = await serial(async () => {
    const m = mergeRecords({ local: (await load()).rows, remote, remoteComplete: complete, pendingWrites: writes, pendingDeletes: deletes });
    await persist(m.rows);
    return m;
  });
  let uploaded = 0;
  for (const rec of merged.toUpload) {
    const { synced: _s, ...upload } = rec;
    if ((await saveRow(cloud.config(), cloud.user, "comparisons", upload)) === "saved") {
      uploaded++;
      await editLocal(rec.id, (r) => ({ ...r, synced: true }));
    }
  }
  return { rows: await listComparisons(), removed: merged.removed, uploaded };
}

/**
 * 기록 지우기. device: 이 기기 파일만 (Supabase에 남은 기록은 다음 동기화 때 돌아옴).
 * all: 이 기기 + Supabase의 내 기록 + 대기열의 기록 (되돌릴 수 없음, Supabase가 설정돼 있으면 로그인 필요). 반환: 지운 이 기기 기록 수
 */
export async function clearComparisons(scope: "device" | "all"): Promise<number> {
  if (scope === "all" && cloudConfigured()) {
    const cloud = useCloud.getState();
    const c = getClient(cloud.config());
    if (!c || cloud.status !== "signed_in" || !cloud.user) throw new Error("Supabase 기록까지 지우려면 먼저 로그인하세요");
    const { error, status } = await c.from(tableName("comparisons")).delete().eq("user_id", cloud.user.id);
    if (error) throw new Error(isCloudUnreachable({ message: error.message, status }) ? UNREACHABLE_MESSAGE : `삭제 실패: ${error.message}`);
    useCloud.setState({ queued: await dropQueued("comparisons") });
  }
  return serial(async () => {
    const n = (await load()).rows.length;
    await persist([]);
    return n;
  });
}

export interface RecordsInfo extends StoreInfo {
  count: number;
}

/** 설정 화면 "기록 저장 위치": 파일 경로·크기·건수 */
export async function recordsInfo(): Promise<RecordsInfo> {
  const [info, rows] = await Promise.all([storeInfo("comparisons"), listComparisons()]);
  return { ...info, count: rows.length };
}
