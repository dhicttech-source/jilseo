import { VERDICTS_KEY, type Grade, type Judged, type Verdict } from "./lenses";
import type { Preset } from "./presets";
import { REVISED_KEY_PREFIX } from "./revise";
import { VERIFY_KEY_PREFIX } from "./verifyPrompt";

/** 비교 기록 responses jsonb 안의 파이프라인 메타 키 (스키마 변경 없이 저장) */
export const PIPELINE_META_KEY = "_meta";

export interface PipelineMeta {
  presetId: string | null;
  depth: string;
  generator: string;
  verifiers: { id: string; lens: string }[];
  revised?: boolean;
}

export interface ComparisonRow {
  id: string;
  prompt?: string;
  responses: Record<string, unknown>;
  created_at?: string;
}

/** 판정 1건 = (기록, 검증 모델, 렌즈) */
export interface VerdictRecord {
  rowId: string;
  at: string;
  generator: string | null;
  presetId: string | null;
  serviceId: string;
  lens: string;
  grade: Grade;
  severe: number;
  parsed: boolean;
  judged?: Judged;
  revised: boolean;
}

const isMetaKey = (k: string) => k.startsWith("_");
const isVerdictsMap = (v: unknown): v is Record<string, Verdict> => !!v && typeof v === "object" && !Array.isArray(v);

/** 메타가 없는 옛 기록: 생성 키는 verify:/revised:/_ 접두어가 아닌 유일한 키 */
function inferGenerator(responses: Record<string, unknown>): string | null {
  const keys = Object.keys(responses).filter((k) => !isMetaKey(k) && !k.startsWith(VERIFY_KEY_PREFIX) && !k.startsWith(REVISED_KEY_PREFIX));
  return keys.length === 1 ? keys[0] : null;
}

/** 파이프라인 기록(판정 메타가 있는 행)에서 판정 레코드를 뽑는다. 동시 전송 기록은 건너뛴다. */
export function extractVerdictRecords(rows: ComparisonRow[]): VerdictRecord[] {
  const out: VerdictRecord[] = [];
  for (const row of rows) {
    const verdicts = row.responses?.[VERDICTS_KEY];
    if (!isVerdictsMap(verdicts)) continue;
    const meta = row.responses[PIPELINE_META_KEY] as Partial<PipelineMeta> | undefined;
    const generator = meta?.generator ?? inferGenerator(row.responses);
    const revised = meta?.revised ?? Object.keys(row.responses).some((k) => k.startsWith(REVISED_KEY_PREFIX));
    for (const [serviceId, v] of Object.entries(verdicts)) {
      if (!v || typeof v !== "object") continue;
      out.push({
        rowId: row.id,
        at: row.created_at ?? "",
        generator,
        presetId: meta?.presetId ?? null,
        serviceId,
        lens: v.lens ?? "composite",
        grade: v.grade ?? "unknown",
        severe: v.counts?.severe ?? 0,
        parsed: !!v.parsed,
        judged: v.judged,
        revised,
      });
    }
  }
  return out;
}

export interface CellStat {
  runs: number;
  parsed: number;
  grades: Record<Grade, number>;
  severeSum: number;
  right: number;
  wrong: number;
  hold: number;
  /** 맞는 지적 비율 = 맞음 ÷ (맞음 + 틀림). 채택이 없으면 null */
  accuracy: number | null;
}
export interface GeneratorStat {
  runs: number;
  trustVotes: number;
  totalVotes: number;
  /** 검증자들이 "신뢰 가능"으로 본 비율 (형식 불명 제외). 표본 없으면 null */
  trustRate: number | null;
  revised: number;
}
export interface Scorecard {
  byLensModel: Record<string, Record<string, CellStat>>;
  byGenerator: Record<string, GeneratorStat>;
  /** 파이프라인 기록 행 수 */
  rows: number;
  from: string | null;
  to: string | null;
}

const emptyCell = (): CellStat => ({
  runs: 0,
  parsed: 0,
  grades: { trust: 0, revise: 0, distrust: 0, unknown: 0 },
  severeSum: 0,
  right: 0,
  wrong: 0,
  hold: 0,
  accuracy: null,
});
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function aggregate(rows: ComparisonRow[]): Scorecard {
  const records = extractVerdictRecords(rows);
  const byLensModel: Record<string, Record<string, CellStat>> = {};
  const byGenerator: Record<string, GeneratorStat> = {};
  const rowIds = new Set<string>();
  const genRows = new Map<string, Set<string>>();
  const genRevised = new Map<string, Set<string>>();
  for (const r of records) {
    rowIds.add(r.rowId);
    const cell = ((byLensModel[r.lens] ??= {})[r.serviceId] ??= emptyCell());
    cell.runs++;
    if (r.parsed) cell.parsed++;
    cell.grades[r.grade]++;
    cell.severeSum += r.severe;
    if (r.judged === "right") cell.right++;
    else if (r.judged === "wrong") cell.wrong++;
    else if (r.judged === "hold") cell.hold++;
    if (r.generator) {
      const g = (byGenerator[r.generator] ??= { runs: 0, trustVotes: 0, totalVotes: 0, trustRate: null, revised: 0 });
      (genRows.get(r.generator) ?? genRows.set(r.generator, new Set()).get(r.generator)!).add(r.rowId);
      if (r.revised) (genRevised.get(r.generator) ?? genRevised.set(r.generator, new Set()).get(r.generator)!).add(r.rowId);
      if (r.grade !== "unknown") {
        g.totalVotes++;
        if (r.grade === "trust") g.trustVotes++;
      }
    }
  }
  for (const lens of Object.values(byLensModel)) for (const c of Object.values(lens)) c.accuracy = ratio(c.right, c.right + c.wrong);
  for (const [gen, g] of Object.entries(byGenerator)) {
    g.runs = genRows.get(gen)?.size ?? 0;
    g.revised = genRevised.get(gen)?.size ?? 0;
    g.trustRate = ratio(g.trustVotes, g.totalVotes);
  }
  const dates = records.map((r) => r.at).filter(Boolean).sort();
  return { byLensModel, byGenerator, rows: rowIds.size, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
}

export interface Recommendation {
  lens: string;
  /** 추천 모델. 표본 부족이면 null */
  model: string | null;
  accuracy: number | null;
  judged: number;
  reason?: "기록 부족";
}

/**
 * 프리셋 슬롯마다 후보(스테이지의 검증 가능 패널) 중 채택 표본이 minJudged 이상이고 맞는 지적 비율이 가장 높은 모델.
 * 동률이면 표본이 많은 쪽. 같은 모델을 두 슬롯에 추천하지 않는다. 추천일 뿐 자동 배정하지 않는다.
 */
export function recommend(card: Scorecard, preset: Preset, candidates: string[], minJudged = 3): Recommendation[] {
  const used = new Set<string>();
  return preset.slots.map((slot) => {
    const cells = card.byLensModel[slot.lens] ?? {};
    let best: { model: string; accuracy: number; judged: number } | null = null;
    for (const model of candidates) {
      if (used.has(model)) continue;
      const c = cells[model];
      const judged = c ? c.right + c.wrong : 0;
      if (!c || judged < minJudged || c.accuracy === null) continue;
      if (!best || c.accuracy > best.accuracy || (c.accuracy === best.accuracy && judged > best.judged)) best = { model, accuracy: c.accuracy, judged };
    }
    if (!best) return { lens: slot.lens, model: null, accuracy: null, judged: 0, reason: "기록 부족" };
    used.add(best.model);
    return { lens: slot.lens, ...best };
  });
}
