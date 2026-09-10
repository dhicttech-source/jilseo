import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { readStore, writeStore } from "./store";

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** 빌드 시 env → 없으면 settings.json의 값 */
export function envConfig(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

/** supabase-js 세션을 로컬 파일(session.json)에 보관하는 스토리지 어댑터 */
function fileStorage() {
  let cache: Record<string, string> | null = null;
  const load = async () => {
    if (!cache) cache = (await readStore<Record<string, string>>("session").catch(() => null)) ?? {};
    return cache;
  };
  const save = () => writeStore("session", cache ?? {}).catch(() => {});
  return {
    getItem: async (key: string) => (await load())[key] ?? null,
    setItem: async (key: string, value: string) => {
      (await load())[key] = value;
      await save();
    },
    removeItem: async (key: string) => {
      delete (await load())[key];
      await save();
    },
  };
}

let client: SupabaseClient | null = null;
let clientKey = "";

export function getClient(cfg: SupabaseConfig | null): SupabaseClient | null {
  if (!cfg?.url || !cfg.anonKey) return null;
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (client && clientKey === key) return client;
  client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      storage: fileStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  clientKey = key;
  return client;
}

export async function currentUser(cfg: SupabaseConfig | null): Promise<User | null> {
  const c = getClient(cfg);
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

// ---------- 오프라인 큐 (지시문 §5: 저장 실패 시 로컬 큐잉 후 재시도) ----------

export type QueueTable = "prompts" | "notes" | "comparisons";
interface QueueItem {
  id: string;
  table: QueueTable;
  op: "insert" | "delete";
  row: Record<string, unknown>;
  at: number;
}

async function readQueue(): Promise<QueueItem[]> {
  return (await readStore<QueueItem[]>("queue").catch(() => null)) ?? [];
}

export async function queueLength(): Promise<number> {
  return (await readQueue()).length;
}

async function enqueue(item: Omit<QueueItem, "id" | "at">) {
  const q = await readQueue();
  q.push({ ...item, id: crypto.randomUUID(), at: Date.now() });
  await writeStore("queue", q);
}

/** 삽입 시도 → 실패(미로그인·오프라인·오류)면 큐에 적재. 반환: 'saved' | 'queued' */
export async function insertOrQueue(
  cfg: SupabaseConfig | null,
  table: QueueTable,
  row: Record<string, unknown>,
): Promise<"saved" | "queued"> {
  const c = getClient(cfg);
  if (c) {
    const { error } = await c.from(table).insert(row);
    if (!error) return "saved";
  }
  await enqueue({ table, op: "insert", row });
  return "queued";
}

export async function deleteOrQueue(cfg: SupabaseConfig | null, table: QueueTable, id: string): Promise<"saved" | "queued"> {
  const c = getClient(cfg);
  if (c) {
    const { error } = await c.from(table).delete().eq("id", id);
    if (!error) return "saved";
  }
  await enqueue({ table, op: "delete", row: { id } });
  return "queued";
}

/** 큐 재시도. 성공한 항목만 제거. 반환: 남은 개수 */
export async function flushQueue(cfg: SupabaseConfig | null): Promise<number> {
  const c = getClient(cfg);
  const q = await readQueue();
  if (!c || q.length === 0) return q.length;
  const { data } = await c.auth.getSession();
  if (!data.session) return q.length;
  const remaining: QueueItem[] = [];
  for (const item of q) {
    const res =
      item.op === "insert"
        ? await c.from(item.table).insert(item.row)
        : await c.from(item.table).delete().eq("id", String(item.row.id));
    if (res.error) remaining.push(item);
  }
  await writeStore("queue", remaining);
  return remaining.length;
}
