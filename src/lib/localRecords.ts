import type { ComparisonRow } from "./scorecard";

/**
 * 이 기기의 비교 기록(comparisons.json)과 Supabase 기록을 합치는 규칙. 순수 함수만 둔다.
 * 기록 원본은 이 기기 파일이고, Supabase는 연결했을 때 두 기기 동기화·백업을 더한다.
 */

/** responses 안의 마지막 수정 시각(ms). 두 기기에서 같은 기록을 고쳤을 때 늦은 쪽을 고르는 기준. Supabase에도 함께 올라간다 */
export const UPDATED_AT_KEY = "_updatedAt";

export interface LocalRecord extends ComparisonRow {
  /** Supabase에서 받아 온 적 있음(= 서버에 있던 기록). 서버에서 사라지면 다른 기기에서 지운 것으로 본다. 서버로는 올리지 않는다 */
  synced?: boolean;
}

export interface RecordsFile {
  version: 1;
  rows: LocalRecord[];
}

export const emptyRecordsFile = (): RecordsFile => ({ version: 1, rows: [] });

/** 파일 내용 검증: 모양이 다르면 빈 파일로 본다 (id·responses가 없는 행은 버린다) */
export function readRecordsFile(v: unknown): RecordsFile {
  const rows = (v as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) return emptyRecordsFile();
  return {
    version: 1,
    rows: rows.filter((r): r is LocalRecord => !!r && typeof r === "object" && typeof (r as LocalRecord).id === "string" && typeof (r as LocalRecord).responses === "object"),
  };
}

export const updatedAt = (r: Pick<ComparisonRow, "responses">): number => {
  const v = r.responses?.[UPDATED_AT_KEY];
  return typeof v === "number" ? v : 0;
};

/** 고친 시각을 찍은 responses */
export const touch = (responses: Record<string, unknown>, now = Date.now()) => ({ ...responses, [UPDATED_AT_KEY]: now });

/** 최근 순 (created_at 내림차순, 같으면 id) */
const byNewest = (a: LocalRecord, b: LocalRecord) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.id.localeCompare(b.id);

export interface MergeInput {
  local: LocalRecord[];
  remote: ComparisonRow[];
  /** 서버 기록을 끝까지 다 받았나. 아니면 "서버에 없음 = 다른 기기에서 지움"으로 판단하지 않는다 */
  remoteComplete: boolean;
  /** 대기열에 올라갈 insert·update가 남은 기록 id (아직 서버에 없거나 서버가 옛 내용) */
  pendingWrites: ReadonlySet<string>;
  /** 대기열에 delete가 남은 기록 id (서버에 아직 있지만 지운 기록) */
  pendingDeletes: ReadonlySet<string>;
}

export interface MergeResult {
  rows: LocalRecord[];
  /** 서버에도 대기열에도 없는 이 기기 기록 → 올려야 함 (Supabase 연결 전에 쌓인 기록) */
  toUpload: LocalRecord[];
  /** 다른 기기에서 지워져 이 기기에서도 지운 개수 */
  removed: number;
}

export function mergeRecords({ local, remote, remoteComplete, pendingWrites, pendingDeletes }: MergeInput): MergeResult {
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const out: LocalRecord[] = [];
  const toUpload: LocalRecord[] = [];
  let removed = 0;

  for (const l of local) {
    const r = remoteById.get(l.id);
    if (r) {
      remoteById.delete(l.id);
      // 같은 시각이면 서버 쪽. 이 기기에서 고친 것은 touch로 시각이 늦으므로 이 기기 쪽이 남는다
      out.push(updatedAt(l) > updatedAt(r) ? { ...l, synced: true } : { ...r, synced: true });
      continue;
    }
    const pending = pendingWrites.has(l.id);
    if (l.synced && remoteComplete && !pending) {
      removed++; // 서버에 있던 기록이 사라짐 = 다른 기기에서 지움
      continue;
    }
    out.push(l);
    if (!l.synced && !pending) toUpload.push(l);
  }
  for (const r of remoteById.values()) {
    if (pendingDeletes.has(r.id)) continue; // 이 기기에서 지웠고 삭제가 아직 대기열에 있음
    out.push({ ...r, synced: true });
  }
  return { rows: out.sort(byNewest), toUpload, removed };
}

/**
 * 기록 파일이 아직 없을 때(이 기능 이전 버전에서 올라온 경우) 대기열에만 있던 비교 기록을 순서대로 재생해 옮겨 온다.
 * insert는 추가, update는 responses 교체, delete는 제거. 대기열 자체는 그대로 두어 서버로 계속 올라간다
 */
export function rowsFromQueue(items: { op: "insert" | "update" | "delete"; row: Record<string, unknown> }[]): LocalRecord[] {
  const byId = new Map<string, LocalRecord>();
  for (const { op, row } of items) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    if (op === "delete") byId.delete(id);
    else if (op === "insert" && row.responses && typeof row.responses === "object") {
      byId.set(id, {
        id,
        prompt: typeof row.prompt === "string" ? row.prompt : "",
        responses: row.responses as Record<string, unknown>,
        created_at: typeof row.created_at === "string" ? row.created_at : undefined,
        device: typeof row.device === "string" ? row.device : null,
      });
    } else if (op === "update" && byId.has(id) && row.responses && typeof row.responses === "object") {
      byId.set(id, { ...byId.get(id)!, responses: row.responses as Record<string, unknown> });
    }
  }
  return [...byId.values()].sort(byNewest);
}

/** 저장 결과: 서버까지 저장 / 이 기기에 저장 + 서버 대기열 / 이 기기에만 (Supabase 미연결) */
export type SaveResult = "saved" | "queued" | "local";
export type SaveState = SaveResult | "skipped";

/** 화면 문구 */
export function saveLabel(s: SaveState): string {
  return s === "saved" ? "저장" : s === "queued" ? "이 기기에 저장 · 동기화 대기" : s === "local" ? "이 기기에 저장" : "기록 안 함";
}

export const isSaved = (s: SaveState | undefined): s is SaveResult => s === "saved" || s === "queued" || s === "local";

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
