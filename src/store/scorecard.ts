import { create } from "zustand";
import { aggregate, type ComparisonRow, type Scorecard } from "../lib/scorecard";
import { getClient } from "../lib/supabase";
import { useCloud } from "./cloud";

/** 성적표: Supabase comparisons 최근 500행을 읽어 집계한다. 로그인 필요, 캐시 없음. */
interface ScorecardState {
  card: Scorecard | null;
  loading: boolean;
  message: string | null;
  loadedAt: number | null;
  load(): Promise<Scorecard | null>;
}

export const MAX_ROWS = 500;

export const useScorecard = create<ScorecardState>((set) => ({
  card: null,
  loading: false,
  message: null,
  loadedAt: null,

  async load() {
    const cloud = useCloud.getState();
    const c = getClient(cloud.config());
    if (!c || cloud.status !== "signed_in") {
      set({ message: "성적표는 Supabase 로그인 상태에서만 볼 수 있습니다 (설정)" });
      return null;
    }
    set({ loading: true, message: null });
    const { data, error } = await c
      .from("comparisons")
      .select("id,responses,created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) {
      set({ loading: false, message: `조회 실패: ${error.message}` });
      return null;
    }
    const card = aggregate((data ?? []) as ComparisonRow[]);
    set({ card, loading: false, loadedAt: Date.now(), message: card.rows === 0 ? "아직 파이프라인 기록이 없습니다" : null });
    return card;
  },
}));
