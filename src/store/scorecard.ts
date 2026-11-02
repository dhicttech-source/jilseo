import { create } from "zustand";
import { aggregate, type ComparisonRow, type Scorecard } from "../lib/scorecard";
import { cloudErrorMessage } from "../lib/cloudError";
import { deleteOrQueue, getClient, tableName, updateOrQueue } from "../lib/supabase";
import { useCloud } from "./cloud";

/**
 * 성적표: Supabase comparisons를 최근 순으로 PAGE행씩 읽어 집계하고(집계 탭), 같은 행을 기록 탭이 목록으로 쓴다.
 * 로그인 필요, 캐시 없음. 평가·채택을 고치면 읽어 둔 행을 바로 고쳐 집계를 다시 계산한다.
 */
interface ScorecardState {
  card: Scorecard | null;
  rows: ComparisonRow[];
  loading: boolean;
  message: string | null;
  loadedAt: number | null;
  /** 더 오래된 기록이 남아 있을 수 있음 (마지막 조회가 PAGE행을 꽉 채움) */
  hasMore: boolean;
  load(): Promise<Scorecard | null>;
  loadMore(): Promise<void>;
  /** 읽어 둔 행의 responses만 바꾸고 다시 집계 (저장은 호출한 쪽). 없는 행이면 seed가 있을 때 맨 앞에 추가 */
  patchRow(id: string, responses: Record<string, unknown>, seed?: Omit<ComparisonRow, "id" | "responses">): void;
  /** 기록 탭의 평가·채택 수정: 로컬 반영 + 행 갱신 (실패 시 큐) */
  saveResponses(id: string, responses: Record<string, unknown>): Promise<"saved" | "queued">;
  remove(id: string): Promise<"saved" | "queued">;
}

export const PAGE = 500;
const COLUMNS = "id,prompt,responses,created_at,device";

const withCard = (rows: ComparisonRow[]) => ({ rows, card: aggregate(rows) });

export const useScorecard = create<ScorecardState>((set, get) => ({
  card: null,
  rows: [],
  loading: false,
  message: null,
  loadedAt: null,
  hasMore: false,

  async load() {
    const cloud = useCloud.getState();
    const c = getClient(cloud.config());
    if (!c || cloud.status !== "signed_in") {
      set({ message: "성적표와 기록은 Supabase 로그인 상태에서만 볼 수 있습니다 (설정)" });
      return null;
    }
    set({ loading: true, message: null });
    const { data, error, status } = await c.from(tableName("comparisons")).select(COLUMNS).order("created_at", { ascending: false }).range(0, PAGE - 1);
    if (error) {
      set({ loading: false, message: cloudErrorMessage({ message: error.message, status }, "조회 실패") });
      return null;
    }
    const rows = (data ?? []) as ComparisonRow[];
    const next = withCard(rows);
    set({ ...next, loading: false, loadedAt: Date.now(), hasMore: rows.length === PAGE, message: rows.length === 0 ? "아직 비교 기록이 없습니다" : null });
    return next.card;
  },

  async loadMore() {
    const c = getClient(useCloud.getState().config());
    const cur = get().rows;
    if (!c || get().loading) return;
    set({ loading: true });
    const { data, error, status } = await c
      .from(tableName("comparisons"))
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .range(cur.length, cur.length + PAGE - 1);
    if (error) {
      set({ loading: false, message: cloudErrorMessage({ message: error.message, status }, "조회 실패") });
      return;
    }
    const more = (data ?? []) as ComparisonRow[];
    const seen = new Set(cur.map((r) => r.id));
    set({ ...withCard([...cur, ...more.filter((r) => !seen.has(r.id))]), loading: false, hasMore: more.length === PAGE });
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
    const cloud = useCloud.getState();
    const res = await updateOrQueue(cloud.config(), "comparisons", id, { responses });
    void cloud.flush();
    return res;
  },

  async remove(id) {
    set(withCard(get().rows.filter((r) => r.id !== id)));
    const cloud = useCloud.getState();
    const res = await deleteOrQueue(cloud.config(), "comparisons", id);
    void cloud.flush();
    return res;
  },
}));
