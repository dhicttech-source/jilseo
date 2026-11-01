import { GRADE_LABEL, VERDICTS_KEY, type Grade, type Judged, type Verdict } from "./lenses";
import { broadcastToMarkdown, pipelineToMarkdown } from "./exportMarkdown";
import { readRating, type Rating } from "./rating";
import { REVISED_KEY_PREFIX } from "./revise";
import { PII_META_KEY, PIPELINE_META_KEY, inferGenerator, rowKind, serviceKeys, type ComparisonRow, type PipelineMeta, type RowKind } from "./scorecard";
import { VERIFY_KEY_PREFIX } from "./verifyPrompt";

/**
 * 성적표의 "기록" 탭: Supabase에 쌓인 비교 기록을 목록·검색·상세로 읽는 순수 함수들.
 * 행 형식은 broadcast.ts(동시 전송)와 pipeline.ts의 buildResponsesRow(생성→검증)가 정한다.
 */

export interface VerifierEntry {
  serviceId: string;
  lens: string;
  text: string;
  verdict: Verdict | null;
}

export interface RecordDetail {
  id: string;
  at: string;
  device: string | null;
  kind: RowKind;
  prompt: string;
  /** 동시 전송: 응답한 서비스 / 파이프라인: 생성 서비스 하나 */
  answers: { serviceId: string; text: string }[];
  generator: string | null;
  verifiers: VerifierEntry[];
  revised: string | null;
  rating: Rating | null;
  presetId: string | null;
  depth: string | null;
  /** 전송 전 비식별화를 거친 기록 (원래 값은 남아 있지 않음) */
  masked: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const isVerdict = (v: unknown): v is Verdict => !!v && typeof v === "object" && "grade" in v;

export function readRecord(row: ComparisonRow): RecordDetail {
  const r = row.responses ?? {};
  const kind = rowKind(row);
  const meta = r[PIPELINE_META_KEY] as Partial<PipelineMeta> | undefined;
  const masked = !!r[PII_META_KEY] || !!meta?.pii;
  const base = {
    id: row.id,
    at: row.created_at ?? "",
    device: row.device ?? null,
    kind,
    prompt: row.prompt ?? "",
    masked,
  };
  if (kind === "broadcast") {
    return {
      ...base,
      answers: serviceKeys(r).map((id) => ({ serviceId: id, text: str(r[id]) })),
      generator: null,
      verifiers: [],
      revised: null,
      rating: readRating(r),
      presetId: null,
      depth: null,
    };
  }
  const generator = meta?.generator ?? inferGenerator(r);
  const verdicts = (r[VERDICTS_KEY] ?? {}) as Record<string, unknown>;
  const ids = Object.keys(r)
    .filter((k) => k.startsWith(VERIFY_KEY_PREFIX))
    .map((k) => k.slice(VERIFY_KEY_PREFIX.length));
  const verifiers = ids.map((id) => {
    const v = verdicts[id];
    const verdict = isVerdict(v) ? v : null;
    return { serviceId: id, lens: verdict?.lens ?? meta?.verifiers?.find((x) => x.id === id)?.lens ?? "composite", text: str(r[VERIFY_KEY_PREFIX + id]), verdict };
  });
  return {
    ...base,
    answers: generator ? [{ serviceId: generator, text: str(r[generator]) }] : [],
    generator,
    verifiers,
    revised: generator ? str(r[REVISED_KEY_PREFIX + generator]) || null : null,
    rating: null,
    presetId: meta?.presetId ?? null,
    depth: meta?.depth ?? null,
  };
}

/** 목록 한 줄 요약: 동시 전송은 ★/✕, 파이프라인은 등급 분포·채택 수 */
export function summaryLine(d: RecordDetail, name: (id: string) => string): string {
  if (d.kind === "broadcast") {
    if (!d.rating) return "미평가";
    return [d.rating.best && `★ ${name(d.rating.best)}`, ...d.rating.fail.map((f) => `✕ ${name(f)}`)].filter(Boolean).join(" · ") || "미평가";
  }
  const grades: Partial<Record<Grade, number>> = {};
  let judged = 0;
  for (const v of d.verifiers) {
    const g = v.verdict?.grade ?? "unknown";
    grades[g] = (grades[g] ?? 0) + 1;
    if (v.verdict?.judged) judged++;
  }
  const dist = (Object.keys(GRADE_LABEL) as Grade[])
    .filter((g) => grades[g])
    .map((g) => `${GRADE_LABEL[g]} ${grades[g]}`)
    .join(" · ");
  return `${d.generator ? name(d.generator) + " 생성 · " : ""}${dist || "판정 없음"} · 채택 ${judged}/${d.verifiers.length}`;
}

export interface RecordFilter {
  q: string;
  kind: "all" | RowKind;
  /** 성적표 칸에서 넘어온 조건: 이 서비스가 응답(동시) 또는 검증(파이프라인)한 기록 */
  service?: string;
  /** 파이프라인: 이 렌즈로 검증한 기록 (service와 함께 쓰면 그 서비스가 그 렌즈로) */
  lens?: string;
  /** 파이프라인: 이 서비스가 생성한 기록 */
  generator?: string;
}

export const emptyFilter = (): RecordFilter => ({ q: "", kind: "all" });

/** 프롬프트·응답·검증·수정본 본문에서 검색 (대소문자 무시, 공백으로 나눈 단어 모두 포함) */
export function matchesQuery(d: RecordDetail, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [d.prompt, ...d.answers.map((a) => a.text), ...d.verifiers.map((v) => v.text), d.revised ?? ""].join("\n").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function matchesFilter(d: RecordDetail, f: RecordFilter): boolean {
  if (f.kind !== "all" && d.kind !== f.kind) return false;
  if (f.generator && (d.kind !== "pipeline" || d.generator !== f.generator)) return false;
  if (f.lens || f.service) {
    if (d.kind === "pipeline") {
      const hit = d.verifiers.some((v) => (!f.service || v.serviceId === f.service) && (!f.lens || v.lens === f.lens));
      if (!hit) return false;
    } else if (f.lens || !d.answers.some((a) => a.serviceId === f.service)) return false;
  }
  return matchesQuery(d, f.q);
}

/** 파이프라인 기록의 판정 채택을 바꾼 responses 사본 (다른 키는 그대로) */
export function withJudged(responses: Record<string, unknown>, serviceId: string, judged: Judged): Record<string, unknown> {
  const verdicts = (responses[VERDICTS_KEY] ?? {}) as Record<string, unknown>;
  const v = verdicts[serviceId];
  if (!isVerdict(v)) return responses;
  return { ...responses, [VERDICTS_KEY]: { ...verdicts, [serviceId]: { ...v, judged } } };
}

/** 지난 기록을 Markdown으로 (요약 카드·전송 바 내보내기와 같은 형식) */
export function recordToMarkdown(d: RecordDetail, name: (id: string) => string, lensName: (id: string) => string): string {
  const at = Date.parse(d.at) || Date.now();
  if (d.kind === "broadcast") {
    return broadcastToMarkdown({ prompt: d.prompt, responses: d.answers.map((a) => ({ name: name(a.serviceId), text: a.text })), at });
  }
  return pipelineToMarkdown({
    prompt: d.prompt,
    generatorName: d.generator ? name(d.generator) : "?",
    answer: d.answers[0]?.text ?? "",
    verifiers: d.verifiers.map((v) => ({ name: name(v.serviceId), lensName: lensName(v.lens), text: v.text, verdict: v.verdict ?? undefined, sent: true })),
    revised: d.revised ?? undefined,
    at,
  });
}
