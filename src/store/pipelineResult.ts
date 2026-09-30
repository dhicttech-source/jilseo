import { create } from "zustand";
import type { Judged } from "../lib/lenses";
import { buildResponsesRow, type PipelineResult } from "../lib/pipeline";
import { updateOrQueue } from "../lib/supabase";
import { useCloud } from "./cloud";

/** 마지막 파이프라인 결과와 사람의 채택. 요약 카드(VerdictCard)가 읽는다. */
interface PipelineResultState {
  result: PipelineResult | null;
  set(result: PipelineResult | null): void;
  /** 판정 채택: 로컬 갱신 + comparisons 행의 responses 갱신 (실패 시 큐) */
  judge(serviceId: string, judged: Judged): Promise<"saved" | "queued" | "skipped">;
}

export const usePipelineResult = create<PipelineResultState>((set, get) => ({
  result: null,
  set: (result) => set({ result }),

  async judge(serviceId, judged) {
    const r = get().result;
    if (!r) return "skipped";
    const verifiers = r.verifiers.map((v) => (v.serviceId === serviceId ? { ...v, verdict: { ...v.verdict, judged } } : v));
    const next = { ...r, verifiers };
    set({ result: next });
    if (r.saved === "skipped") return "skipped";
    const cloud = useCloud.getState();
    const res = await updateOrQueue(cloud.config(), "comparisons", r.rowId, {
      responses: buildResponsesRow(r.generator, r.answer, verifiers),
    });
    void cloud.flush();
    return res;
  },
}));
