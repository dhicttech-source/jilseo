import { create } from "zustand";
import type { Judged } from "../lib/lenses";
import { buildResponsesRow, runRevise, type PipelineResult } from "../lib/pipeline";
import { updateOrQueue } from "../lib/supabase";
import { useCloud } from "./cloud";

/** 마지막 파이프라인 결과와 사람의 채택. 요약 카드(VerdictCard)가 읽는다. */
interface PipelineResultState {
  result: PipelineResult | null;
  /** 수정 단계 진행 중 (카드 버튼 잠금·문구) */
  revising: boolean;
  set(result: PipelineResult | null): void;
  /** 카드의 "수정본 요청": 마지막 결과의 판정을 생성 패널에 되돌린다 (전송 1회) */
  revise(): Promise<void>;
  /** 판정 채택: 로컬 갱신 + comparisons 행의 responses 갱신 (실패 시 큐) */
  judge(serviceId: string, judged: Judged): Promise<"saved" | "queued" | "skipped">;
}

export const usePipelineResult = create<PipelineResultState>((set, get) => ({
  result: null,
  revising: false,
  set: (result) => set({ result, revising: false }),

  async revise() {
    const r = get().result;
    if (!r || get().revising) return;
    set({ revising: true });
    try {
      const next = await runRevise(r);
      // 진행 중에 사용자가 채택을 눌렀을 수 있으므로 판정은 최신 것을 유지
      const cur = get().result;
      set({ result: cur && cur.rowId === next.rowId ? { ...next, verifiers: cur.verifiers } : next, revising: false });
    } catch (e) {
      const cur = get().result;
      set({ result: cur ? { ...cur, reviseError: e instanceof Error ? e.message : String(e) } : cur, revising: false });
    }
  },

  async judge(serviceId, judged) {
    const r = get().result;
    if (!r) return "skipped";
    const verifiers = r.verifiers.map((v) => (v.serviceId === serviceId ? { ...v, verdict: { ...v.verdict, judged } } : v));
    const next = { ...r, verifiers };
    set({ result: next });
    if (r.saved === "skipped") return "skipped";
    const cloud = useCloud.getState();
    const res = await updateOrQueue(cloud.config(), "comparisons", r.rowId, {
      responses: buildResponsesRow(r.generator, r.answer, verifiers, r.revised, { presetId: r.presetId, depth: r.depth }),
    });
    void cloud.flush();
    return res;
  },
}));
