import { ServiceAdapter, type Attachment } from "../adapters";
import { moveToNewChatAfterFile, sendAndCollect } from "./broadcast";
import { buildLensPrompt, parseVerdict, resolveLens, VERDICTS_KEY, type Lens, type Verdict } from "./lenses";
import { resolvePipelineRoles } from "./roles";
import { saveRow } from "./supabase";
import { verifyKey } from "./verifyPrompt";
import { useAttachment } from "../store/attachment";
import { useCloud } from "../store/cloud";
import { useStage } from "../store/stage";

export type PipelineStep = "generate" | "verify" | "done";

export interface VerifierResult {
  serviceId: string;
  lens: Lens;
  /** 검증 원문 (Markdown). 전송 실패면 빈 문자열 */
  text: string;
  verdict: Verdict;
  sent: boolean;
}

export interface PipelineResult {
  /** comparisons 행 id (채택 클릭 시 갱신 대상) */
  rowId: string;
  prompt: string;
  generator: string;
  answer: string;
  verifiers: VerifierResult[];
  verifiersSent: number;
  verifiersTotal: number;
  saved: "saved" | "queued" | "skipped";
  ms: number;
  at: number;
}

/** 검증 패널의 렌즈 (미배정은 종합) */
export function lensFor(serviceId: string): Lens {
  const { lensAssign, lensOverrides, customLenses } = useStage.getState();
  return resolveLens(lensAssign[serviceId], lensOverrides, customLenses);
}

/** 비교 기록 responses jsonb 조립: 생성은 id, 검증은 verify:id, 판정 메타는 _verdicts */
export function buildResponsesRow(generatorId: string, answer: string, verifiers: VerifierResult[]) {
  const responses: Record<string, unknown> = { [generatorId]: answer };
  const verdicts: Record<string, Verdict> = {};
  for (const v of verifiers) {
    if (!v.sent) continue;
    responses[verifyKey(v.serviceId)] = v.text;
    verdicts[v.serviceId] = v.verdict;
  }
  responses[VERDICTS_KEY] = verdicts;
  return responses;
}

/**
 * 생성 → 검증 파이프라인. 사용자 클릭 1회에 생성 1건 + 검증 N건이 고정 순서로 한 번만 나간다 (재시도·반복 없음, 지시문 §8).
 * 1단계: 생성 패널에만 텍스트(+첨부) 전송 → 응답 완료 대기
 * 2단계: 검증 패널마다 배정된 렌즈로 프롬프트를 만들어 동시 전송 → 응답 수집 → 판정 블록 파싱
 * 비교 기록 1건 (buildResponsesRow 형식)
 */
export async function runPipeline(
  text: string,
  onProgress: (step: PipelineStep, detail: string) => void = () => {},
  attachment: Attachment | null = useAttachment.getState().file,
): Promise<PipelineResult> {
  const body = text.trim();
  if (!body) throw new Error("보낼 내용이 없습니다");
  const { stage, roles, services, device } = useStage.getState();
  const resolved = resolvePipelineRoles(stage, roles, services);
  if (resolved.error || !resolved.generator) throw new Error(resolved.error ?? "생성 패널이 없습니다");
  const gen = resolved.generator;
  const t0 = performance.now();
  if (attachment) useAttachment.getState().set(null); // 첨부는 생성 단계 1회만

  onProgress("generate", `${gen.name} 생성 중`);
  const first = await sendAndCollect(body, [new ServiceAdapter(gen)], attachment);
  if (!first.sent[gen.id]?.ok) throw new Error(`생성 전송 실패: ${first.sent[gen.id]?.detail ?? ""}`);
  const answer = first.responses[gen.id] ?? "";
  if (!answer.trim()) throw new Error(`${gen.name} 응답을 받지 못했습니다`);

  const lenses = new Map(resolved.verifiers.map((v) => [v.id, lensFor(v.id)] as const));
  onProgress("verify", `${resolved.verifiers.map((v) => `${v.name}(${lenses.get(v.id)!.name})`).join("·")} 검증 중`);
  // 렌즈가 패널마다 다르므로 텍스트별로 묶어 전송한다 (같은 렌즈는 한 번에)
  const groups = new Map<string, ServiceAdapter[]>();
  for (const v of resolved.verifiers) {
    const prompt = buildLensPrompt(lenses.get(v.id)!, body, answer);
    groups.set(prompt, [...(groups.get(prompt) ?? []), new ServiceAdapter(v)]);
  }
  const seconds = await Promise.all([...groups].map(([prompt, adapters]) => sendAndCollect(prompt, adapters, null)));
  const sent = Object.assign({}, ...seconds.map((s) => s.sent)) as Record<string, { ok: boolean }>;
  const texts = Object.assign({}, ...seconds.map((s) => s.responses)) as Record<string, string>;

  const verifiers: VerifierResult[] = resolved.verifiers.map((v) => {
    const lens = lenses.get(v.id)!;
    const ok = !!sent[v.id]?.ok;
    const t = ok ? (texts[v.id] ?? "") : "";
    return { serviceId: v.id, lens, text: t, verdict: parseVerdict(t, lens.id), sent: ok };
  });

  const rowId = crypto.randomUUID();
  const cloud = useCloud.getState();
  const saved = await saveRow(cloud.config(), cloud.user, "comparisons", {
    id: rowId,
    prompt: body,
    responses: buildResponsesRow(gen.id, answer, verifiers),
    device,
  });
  void cloud.flush();
  if (attachment) moveToNewChatAfterFile([gen]);

  const verifiersSent = verifiers.filter((v) => v.sent).length;
  onProgress("done", `검증 ${verifiersSent}/${resolved.verifiers.length}`);
  return {
    rowId,
    prompt: body,
    generator: gen.id,
    answer,
    verifiers,
    verifiersSent,
    verifiersTotal: resolved.verifiers.length,
    saved,
    ms: Math.round(performance.now() - t0),
    at: Date.now(),
  };
}
