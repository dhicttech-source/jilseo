import { ServiceAdapter, type Attachment } from "../adapters";
import { moveToNewChatAfterFile, sendAndCollect } from "./broadcast";
import { buildLensPrompt, parseVerdict, resolveLens, VERDICTS_KEY, type Lens, type Verdict } from "./lenses";
import { depthOf, findPreset, limitByDepth, type Depth } from "./presets";
import { DEFAULT_REVISE_TEMPLATE, REVISE_TEMPLATE_KEY, buildRevisePrompt, revisedKey } from "./revise";
import { resolvePipelineRoles } from "./roles";
import { saveRow, updateOrQueue } from "./supabase";
import { verifyKey } from "./verifyPrompt";
import { useAttachment } from "../store/attachment";
import { useCloud } from "../store/cloud";
import { useStage } from "../store/stage";

export type PipelineStep = "generate" | "verify" | "revise" | "done";

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
  depth: Depth;
  presetId: string | null;
  /** 깊이 상한으로 이번 실행에서 빠진 검증 패널 id */
  skipped: string[];
  /** 수정 단계 결과 (심층 깊이 자동, 그 외 카드 버튼). 없으면 미실행 */
  revised?: string;
  reviseError?: string;
}

/** 검증 패널의 렌즈 (미배정은 종합) */
export function lensFor(serviceId: string): Lens {
  const { lensAssign, lensOverrides, customLenses } = useStage.getState();
  return resolveLens(lensAssign[serviceId], lensOverrides, customLenses);
}

/** 비교 기록 responses jsonb 조립: 생성은 id, 검증은 verify:id, 수정본은 revised:id, 판정 메타는 _verdicts */
export function buildResponsesRow(generatorId: string, answer: string, verifiers: VerifierResult[], revised?: string) {
  const responses: Record<string, unknown> = { [generatorId]: answer };
  if (revised?.trim()) responses[revisedKey(generatorId)] = revised;
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
  const { stage, roles, services, device, depth, presetId } = useStage.getState();
  const resolved = resolvePipelineRoles(stage, roles, services);
  if (resolved.error || !resolved.generator) throw new Error(resolved.error ?? "생성 패널이 없습니다");
  const gen = resolved.generator;
  // 깊이 상한: 프리셋 슬롯 순서(렌즈 배정 순)를 우선해 앞에서 자른다
  const preferred = presetId ? verifierOrderForPreset(presetId, resolved.verifiers.map((v) => v.id)) : [];
  const verifierDefs = limitByDepth(resolved.verifiers, depth, (v) => v.id, preferred);
  const skipped = resolved.verifiers.filter((v) => !verifierDefs.includes(v)).map((v) => v.id);
  const lengthHint = depthOf(depth).lengthHint;
  const t0 = performance.now();
  if (attachment) useAttachment.getState().set(null); // 첨부는 생성 단계 1회만

  onProgress("generate", `${gen.name} 생성 중`);
  const first = await sendAndCollect(body, [new ServiceAdapter(gen)], attachment);
  if (!first.sent[gen.id]?.ok) throw new Error(`생성 전송 실패: ${first.sent[gen.id]?.detail ?? ""}`);
  const answer = first.responses[gen.id] ?? "";
  if (!answer.trim()) throw new Error(`${gen.name} 응답을 받지 못했습니다`);

  const lenses = new Map(verifierDefs.map((v) => [v.id, lensFor(v.id)] as const));
  onProgress("verify", `${verifierDefs.map((v) => `${v.name}(${lenses.get(v.id)!.name})`).join("·")} 검증 중`);
  // 렌즈가 패널마다 다르므로 텍스트별로 묶어 전송한다 (같은 렌즈는 한 번에)
  const groups = new Map<string, ServiceAdapter[]>();
  for (const v of verifierDefs) {
    const prompt = buildLensPrompt(lenses.get(v.id)!, body, answer, lengthHint);
    groups.set(prompt, [...(groups.get(prompt) ?? []), new ServiceAdapter(v)]);
  }
  const seconds = await Promise.all([...groups].map(([prompt, adapters]) => sendAndCollect(prompt, adapters, null)));
  const sent = Object.assign({}, ...seconds.map((s) => s.sent)) as Record<string, { ok: boolean }>;
  const texts = Object.assign({}, ...seconds.map((s) => s.responses)) as Record<string, string>;

  const verifiers: VerifierResult[] = verifierDefs.map((v) => {
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
  const result: PipelineResult = {
    rowId,
    prompt: body,
    generator: gen.id,
    answer,
    verifiers,
    verifiersSent,
    verifiersTotal: verifierDefs.length,
    saved,
    ms: Math.round(performance.now() - t0),
    at: Date.now(),
    depth,
    presetId,
    skipped,
  };
  // 심층 깊이: 판정을 생성 패널에 되돌려 수정본까지 받는다 (전송 +1, 고정 순서)
  const final = depth === "deep" && verifiersSent > 0 ? await runRevise(result, onProgress) : result;
  onProgress("done", `검증 ${verifiersSent}/${verifierDefs.length}${final.revised ? " · 수정본 수신" : ""}`);
  return final;
}

/** 수정 단계 템플릿 (설정에서 덮어쓰기 가능) */
export function reviseTemplate(): string {
  return useStage.getState().lensOverrides[REVISE_TEMPLATE_KEY]?.trim() || DEFAULT_REVISE_TEMPLATE;
}

/**
 * 수정 단계: 검증 판정들을 생성 패널의 같은 대화에 보내 수정본을 받고, 같은 비교 기록 행에 revised:<id>로 저장한다.
 * 심층 깊이의 자동 실행과 카드의 "수정본 요청" 버튼이 함께 쓴다. 사용자 동작 1회 = 전송 1회.
 */
export async function runRevise(result: PipelineResult, onProgress: (step: PipelineStep, detail: string) => void = () => {}): Promise<PipelineResult> {
  const { services } = useStage.getState();
  const gen = services.find((s) => s.id === result.generator);
  if (!gen) return { ...result, reviseError: "생성 패널이 없습니다" };
  const prompt = buildRevisePrompt(
    reviseTemplate(),
    result.verifiers
      .filter((v) => v.sent)
      .map((v) => ({ name: services.find((s) => s.id === v.serviceId)?.name ?? v.serviceId, lensName: v.lens.name, text: v.text })),
  );
  if (!prompt) return { ...result, reviseError: "되돌릴 판정이 없습니다" };
  onProgress("revise", `${gen.name} 수정본 작성 중`);
  const r = await sendAndCollect(prompt, [new ServiceAdapter(gen)], null);
  if (!r.sent[gen.id]?.ok) return { ...result, reviseError: `수정 전송 실패: ${r.sent[gen.id]?.detail ?? ""}` };
  const revised = r.responses[gen.id] ?? "";
  if (!revised.trim()) return { ...result, reviseError: `${gen.name} 수정본을 받지 못했습니다` };
  const next: PipelineResult = { ...result, revised, reviseError: undefined };
  if (result.saved !== "skipped") {
    const cloud = useCloud.getState();
    await updateOrQueue(cloud.config(), "comparisons", result.rowId, {
      responses: buildResponsesRow(result.generator, result.answer, result.verifiers, revised),
    });
    void cloud.flush();
  }
  return next;
}

/** 프리셋 슬롯 순서대로 검증 패널 id를 정렬한 목록 (깊이 절단의 우선순위) */
function verifierOrderForPreset(presetId: string, verifierIds: string[]): string[] {
  const preset = findPreset(presetId);
  if (!preset) return [];
  const { lensAssign } = useStage.getState();
  const used = new Set<string>();
  const order: string[] = [];
  for (const slot of preset.slots) {
    const id = verifierIds.find((v) => !used.has(v) && lensAssign[v] === slot.lens);
    if (id) {
      used.add(id);
      order.push(id);
    }
  }
  return order;
}
