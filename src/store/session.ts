import { create } from "zustand";
import type { MaskEntry } from "../lib/pii/mask";
import { emptyRating, readRating, toggleBest, toggleFail, withRating, type Rating } from "../lib/rating";
import { updateComparison } from "../lib/comparisons";
import { isSaved, type SaveResult, type SaveState } from "../lib/localRecords";
import { useScorecard } from "./scorecard";
import { useStage } from "./stage";

/**
 * 앱 세션 동안만 유지되는 상태 (설정에 저장하지 않음).
 * - ephemeral: 임시 전송. 켜져 있으면 비교 기록·채택·수정본을 클라우드에 저장하지 않는다 (LibreChat의 Temporary Chat).
 * - lastBroadcast: 마지막 동시 전송 결과 (Markdown 내보내기·응답 평가용)
 */
export interface LastBroadcast {
  prompt: string;
  responses: Record<string, string>;
  at: number;
  ephemeral: boolean;
  /** 전송 전 가림 대응표 (이 기기 메모리에만, 복원 표시용) */
  pii?: MaskEntry[];
  /** 비교 기록 행 id와 저장 결과, 저장한 responses 원본(_pii 포함) — 평가 갱신용 */
  rowId?: string;
  saved?: SaveState;
  row?: Record<string, unknown>;
  rating?: Rating;
}

interface SessionState {
  ephemeral: boolean;
  lastBroadcast: LastBroadcast | null;
  setEphemeral(v: boolean): void;
  setLastBroadcast(b: LastBroadcast | null): void;
  /** 마지막 동시 전송 응답 평가: ★ 최고 / ✕ 실패 토글 → 같은 비교 기록 행 갱신 (실패 시 큐) */
  rateLast(kind: "best" | "fail", serviceId: string): Promise<SaveResult | "skipped">;
}

export const useSession = create<SessionState>((set, get) => ({
  ephemeral: false,
  lastBroadcast: null,
  setEphemeral: (ephemeral) => set({ ephemeral }),
  setLastBroadcast: (lastBroadcast) => set({ lastBroadcast }),

  async rateLast(kind, serviceId) {
    const b = get().lastBroadcast;
    if (!b || !b.rowId || !b.row || !isSaved(b.saved)) return "skipped";
    const cur = b.rating ?? readRating(b.row) ?? emptyRating();
    const rating = kind === "best" ? toggleBest(cur, serviceId) : toggleFail(cur, serviceId);
    const row = withRating(b.row, rating);
    set({ lastBroadcast: { ...b, rating, row } });
    // 성적표를 열어 둔 상태면 집계에 바로 반영 (조회 뒤에 보낸 기록이면 맨 앞에 추가)
    useScorecard.getState().patchRow(b.rowId, row, { prompt: b.prompt, created_at: new Date(b.at).toISOString(), device: useStage.getState().device });
    return updateComparison(b.rowId, row);
  },
}));
