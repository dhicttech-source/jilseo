import { ServiceAdapter, type Attachment } from "../adapters";
import { moveToNewChatAfterFile, sendAndCollect } from "./broadcast";
import { resolvePipelineRoles } from "./roles";
import { saveRow } from "./supabase";
import { buildVerifyPrompt, verifyKey } from "./verifyPrompt";
import { useAttachment } from "../store/attachment";
import { useCloud } from "../store/cloud";
import { useStage } from "../store/stage";

export type PipelineStep = "generate" | "verify" | "done";

export interface PipelineResult {
  generator: string;
  answer: string;
  /** 검증 패널 id → 판정 본문 (전송 실패한 패널은 빠짐) */
  verdicts: Record<string, string>;
  verifiersSent: number;
  verifiersTotal: number;
  saved: "saved" | "queued" | "skipped";
  ms: number;
}

/**
 * 생성 → 검증 파이프라인. 사용자 클릭 1회에 생성 1건 + 검증 N건이 고정 순서로 한 번만 나간다 (재시도·반복 없음, 지시문 §8).
 * 1단계: 생성 패널에만 텍스트(+첨부) 전송 → 응답 완료 대기
 * 2단계: 검증 패널들에 템플릿(질문+답변) 동시 전송 → 응답 수집
 * 비교 기록 1건: responses = { [생성 id]: 답변, ["verify:"+검증 id]: 판정 }
 */
export async function runPipeline(
  text: string,
  onProgress: (step: PipelineStep, detail: string) => void = () => {},
  attachment: Attachment | null = useAttachment.getState().file,
): Promise<PipelineResult> {
  const body = text.trim();
  if (!body) throw new Error("보낼 내용이 없습니다");
  const { stage, roles, services, device, verifyTemplate } = useStage.getState();
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

  onProgress("verify", `${resolved.verifiers.map((v) => v.name).join("·")} 검증 중`);
  const prompt = buildVerifyPrompt(verifyTemplate, body, answer);
  const second = await sendAndCollect(
    prompt,
    resolved.verifiers.map((v) => new ServiceAdapter(v)),
    null,
  );

  const responses: Record<string, string> = { [gen.id]: answer };
  for (const [id, verdict] of Object.entries(second.responses)) responses[verifyKey(id)] = verdict;
  const cloud = useCloud.getState();
  const saved = await saveRow(cloud.config(), cloud.user, "comparisons", { prompt: body, responses, device });
  void cloud.flush();
  if (attachment) moveToNewChatAfterFile([gen]);

  const verifiersSent = Object.values(second.sent).filter((r) => r.ok).length;
  onProgress("done", `검증 ${verifiersSent}/${resolved.verifiers.length}`);
  return {
    generator: gen.id,
    answer,
    verdicts: second.responses,
    verifiersSent,
    verifiersTotal: resolved.verifiers.length,
    saved,
    ms: Math.round(performance.now() - t0),
  };
}
