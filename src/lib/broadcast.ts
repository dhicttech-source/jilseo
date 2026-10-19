import {
  ServiceAdapter,
  broadcastText,
  isBroadcastTarget,
  type Attachment,
  type ResponseSnapshot,
  type ServiceDef,
} from "../adapters";
import { htmlToMarkdown } from "./markdown";
import { navigatePanel } from "./panels";
import { saveRow } from "./supabase";
import { useAttachment } from "../store/attachment";
import { useCloud } from "../store/cloud";
import { useSession } from "../store/session";
import { useStage } from "../store/stage";

export type SentResults = Record<string, { ok: boolean; detail?: string }>;

export interface BroadcastOutcome {
  sent: SentResults;
  okCount: number;
  ms: number;
  /** 전송된 패널 전부의 응답이 끝나고 비교 기록 저장까지 마치면 resolve */
  completion: Promise<{ responses: Record<string, string>; saved: "saved" | "queued" | "skipped" }>;
}

/**
 * 텍스트(+첨부)를 패널들에 전송하고, 전송에 성공한 패널의 응답이 끝날 때까지 관찰해 Markdown으로 모은다.
 * 동시 전송(runBroadcast)과 파이프라인(runPipeline)이 공유하는 전송·수집 단위. 저장은 하지 않는다.
 */
export async function sendAndCollect(
  text: string,
  adapters: ServiceAdapter[],
  attachment: Attachment | null,
  onSent?: (sent: SentResults) => void,
): Promise<{ sent: SentResults; responses: Record<string, string> }> {
  const { setStatus } = useStage.getState();
  // 전송 전 스냅샷: 기존 대화의 마지막 응답을 새 응답으로 오인하지 않기 위해
  const baselines = new Map<string, ResponseSnapshot>();
  await Promise.all(adapters.map(async (a) => baselines.set(a.id, await a.snapshotResponse())));
  const sent = await broadcastText(text, adapters, (id, phase, detail) => setStatus(id, phase, detail), attachment);
  onSent?.(sent);
  const responses: Record<string, string> = {};
  await Promise.all(
    adapters
      .filter((a) => sent[a.id]?.ok)
      .map(async (a) => {
        setStatus(a.id, "responding");
        const plain = await a
          .observeResponse(
            (_t, done) => {
              if (done) setStatus(a.id, "done");
            },
            { baseline: baselines.get(a.id) },
          )
          .catch(() => "");
        // 렌더링 HTML → Markdown (Phase 3). 실패 시 innerText 그대로.
        const html = await a.readResponseHtml().catch(() => "");
        responses[a.id] = htmlToMarkdown(html, plain);
      }),
  );
  return { sent, responses };
}

/**
 * 스테이지 패널 전부에 텍스트 전송 → 응답 관찰 → 비교 기록 1건 저장.
 * UI(BroadcastBar)와 테스트 하네스가 공유하는 단일 진입점.
 */
export function runBroadcast(
  text: string,
  targets?: ServiceDef[],
  attachment: Attachment | null = useAttachment.getState().file,
): BroadcastOutcome | null {
  const body = text.trim();
  const { services, stage, device } = useStage.getState();
  const defs = (
    targets ?? stage.map((id) => services.find((s) => s.id === id)).filter((s): s is ServiceDef => !!s)
  ).filter(isBroadcastTarget);
  if (!body || defs.length === 0) return null;

  const adapters = defs.map((d) => new ServiceAdapter(d));
  const t0 = performance.now();
  if (attachment) useAttachment.getState().set(null); // 첨부는 1회 전송 후 해제

  const outcome: BroadcastOutcome = { sent: {}, okCount: 0, ms: 0, completion: Promise.resolve({ responses: {}, saved: "skipped" }) };
  // sent 결과는 전송 단계가 끝나는 즉시 동기적으로 접근할 수 있도록 채워 넣는다
  const collected = sendAndCollect(body, adapters, attachment, (sent) => {
    outcome.sent = sent;
    outcome.okCount = Object.values(sent).filter((r) => r.ok).length;
    outcome.ms = Math.round(performance.now() - t0);
  });
  outcome.completion = collected.then(async ({ sent, responses }) => {
    const okDefs = defs.filter((d) => sent[d.id]?.ok);
    if (okDefs.length === 0) return { responses: {}, saved: "skipped" as const };
    const { ephemeral, setLastBroadcast } = useSession.getState();
    setLastBroadcast({ prompt: body, responses, at: Date.now(), ephemeral });
    // 임시 전송이면 클라우드에 남기지 않는다
    let saved: "saved" | "queued" | "skipped" = "skipped";
    if (!ephemeral) {
      const cloud = useCloud.getState();
      saved = await saveRow(cloud.config(), cloud.user, "comparisons", { prompt: body, responses, device });
      void cloud.flush();
    }
    if (attachment) moveToNewChatAfterFile(okDefs);
    return { responses, saved };
  });
  return outcome;
}

/** 전송 단계까지만 기다리는 헬퍼 */
export async function runBroadcastAndWaitSent(text: string, targets?: ServiceDef[]) {
  const o = runBroadcast(text, targets);
  if (!o) return null;
  await new Promise((r) => setTimeout(r, 0));
  // sent가 채워질 때까지 대기 (completion보다 먼저 끝남)
  while (o.ms === 0 && Object.keys(o.sent).length === 0) await new Promise((r) => setTimeout(r, 50));
  return o;
}

/** 파일 전송 뒤 새 채팅 이동: 서비스 정의에 afterFileBroadcast=new_chat 이고 설정이 켜진 경우만 */
export function moveToNewChatAfterFile(defs: ServiceDef[]) {
  const { newChatAfterFile, setStatus } = useStage.getState();
  if (!newChatAfterFile) return;
  for (const d of defs) {
    if (d.afterFileBroadcast !== "new_chat") continue;
    navigatePanel(d.id, d.url)
      .then(() => setStatus(d.id, "ready", "새 채팅으로 이동"))
      .catch(() => {});
  }
}
