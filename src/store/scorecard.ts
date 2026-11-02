import { create } from "zustand";
import { clearComparisons, deleteComparison, listComparisons, syncComparisons, updateComparison } from "../lib/comparisons";
import type { SaveResult } from "../lib/localRecords";
import { aggregate, type ComparisonRow, type Scorecard } from "../lib/scorecard";
import { useCloud } from "./cloud";

/**
 * 성적표: 이 기기의 비교 기록(comparisons.json)을 집계하고(집계 탭), 같은 행을 기록 탭이 목록으로 쓴다.
 * Supabase에 로그인돼 있으면 열 때마다 서버 기록과 합친다(두 기기 동기화). 평가·채택을 고치면 읽어 둔 행을 바로 고쳐 다시 집계한다.
 */

/** local: Supabase 미설정(이 기기만) / signed_out: 설정했지만 로그인 안 됨 / syncing / synced / error */
export type SyncState = "local" | "signed_out" | "syncing" | "synced" | "error";

interface ScorecardState {
  card: Scorecard | null;
  rows: ComparisonRow[];
  loading: boolean;
  message: string | null;
  loadedAt: number | null;
  sync: SyncState;
  /** 동기화 결과 한 줄 (다른 기기에서 지운 n건 반영 등) 또는 실패 문구 */
  syncNote: string | null;
  load(): Promise<Scorecard | null>;
  /** 읽어 둔 행의 responses만 바꾸고 다시 집계 (저장은 호출한 쪽). 없는 행이면 seed가 있을 때 맨 앞에 추가 */
  patchRow(id: string, responses: Record<string, unknown>, seed?: Omit<ComparisonRow, "id" | "responses">): void;
  /** 기록 탭의 평가·채택 수정: 화면 반영 + 이 기기 저장 + (연결 시) 서버 갱신 */
  saveResponses(id: string, responses: Record<string, unknown>): Promise<SaveResult>;
  remove(id: string): Promise<SaveResult>;
  /** 설정의 기록 지우기. 반환: 지운 이 기기 기록 수 */
  clear(scope: "device" | "all"): Promise<number>;
}

const EMPTY = "아직 비교 기록이 없습니다";
const withCard = (rows: ComparisonRow[]) => ({ rows, card: aggregate(rows) });

function syncSummary(removed: number, uploaded: number): string | null {
  const parts = [removed ? `다른 기기에서 지운 ${removed}건 반영` : "", uploaded ? `이 기기 기록 ${uploaded}건 올림` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const useScorecard = create<ScorecardState>((set, get) => ({
  card: null,
  rows: [],
  loading: false,
  message: null,
  loadedAt: null,
  sync: "local",
  syncNote: null,

  async load() {
    if (get().loading) return get().card;
    set({ loading: true, message: null });
    const local = await listComparisons();
    set({ ...withCard(local), loadedAt: Date.now(), message: local.length ? null : EMPTY });
    const cloud = useCloud.getState();
    if (!cloud.config() || cloud.status !== "signed_in") {
      set({ loading: false, sync: cloud.config() ? (cloud.status === "error" ? "error" : "signed_out") : "local", syncNote: cloud.status === "error" ? cloud.message : null });
      return get().card;
    }
    set({ sync: "syncing" });
    try {
      const r = await syncComparisons();
      set({ ...withCard(r.rows), loading: false, sync: "synced", syncNote: syncSummary(r.removed, r.uploaded), message: r.rows.length ? null : EMPTY });
    } catch (e) {
      set({ loading: false, sync: "error", syncNote: e instanceof Error ? e.message : String(e) });
    }
    return get().card;
  },

  patchRow(id, responses, seed) {
    const { rows, loadedAt } = get();
    if (!loadedAt) return; // 아직 성적표를 열지 않았으면 다음 조회 때 반영된다
    const has = rows.some((r) => r.id === id);
    if (!has && !seed) return;
    const next = has ? rows.map((r) => (r.id === id ? { ...r, responses } : r)) : [{ ...seed, id, responses }, ...rows];
    set(withCard(next));
  },

  async saveResponses(id, responses) {
    get().patchRow(id, responses);
    return updateComparison(id, responses);
  },

  async remove(id) {
    set(withCard(get().rows.filter((r) => r.id !== id)));
    return deleteComparison(id);
  },

  async clear(scope) {
    const n = await clearComparisons(scope);
    set({ ...withCard([]), message: EMPTY, syncNote: null });
    return n;
  },
}));
