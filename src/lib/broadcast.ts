import {
  ServiceAdapter,
  broadcastText,
  isBroadcastTarget,
  type Attachment,
  type ResponseSnapshot,
  type ServiceDef,
} from "../adapters";
import { htmlToMarkdown } from "./markdown";
import { saveRow } from "./supabase";
import { useAttachment } from "../store/attachment";
import { useCloud } from "../store/cloud";
import { useStage } from "../store/stage";

export interface BroadcastOutcome {
  sent: Record<string, { ok: boolean; detail?: string }>;
  okCount: number;
  ms: number;
  /** 전송된 패널 전부의 응답이 끝나고 비교 기록 저장까지 마치면 resolve */
  completion: Promise<{ responses: Record<string, string>; saved: "saved" | "queued" | "skipped" }>;
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
  const { services, stage, setStatus, device } = useStage.getState();
  const defs = (
    targets ?? stage.map((id) => services.find((s) => s.id === id)).filter((s): s is ServiceDef => !!s)
  ).filter(isBroadcastTarget);
  if (!body || defs.length === 0) return null;

  const adapters = defs.map((d) => new ServiceAdapter(d));
  const t0 = performance.now();
  // 전송 전 스냅샷: 기존 대화의 마지막 응답을 새 응답으로 오인하지 않기 위해
  const baselines = new Map<string, ResponseSnapshot>();
  const sentPromise = Promise.all(adapters.map(async (a) => baselines.set(a.id, await a.snapshotResponse()))).then(() =>
    broadcastText(body, adapters, (id, phase, detail) => setStatus(id, phase, detail), attachment),
  );
  if (attachment) useAttachment.getState().set(null); // 첨부는 1회 전송 후 해제

  const outcome: BroadcastOutcome = {
    sent: {},
    okCount: 0,
    ms: 0,
    completion: sentPromise.then(async (results) => {
      const sent = adapters.filter((a) => results[a.id]?.ok);
      if (sent.length === 0) return { responses: {}, saved: "skipped" as const };
      const responses: Record<string, string> = {};
      await Promise.all(
        sent.map(async (a) => {
          setStatus(a.id, "responding");
          const text = await a
            .observeResponse(
              (_t, done) => {
                if (done) setStatus(a.id, "done");
              },
              { baseline: baselines.get(a.id) },
            )
            .catch(() => "");
          // 렌더링 HTML → Markdown (Phase 3). 실패 시 innerText 그대로.
          const html = await a.readResponseHtml().catch(() => "");
          responses[a.id] = htmlToMarkdown(html, text);
        }),
      );
      const cloud = useCloud.getState();
      const saved = await saveRow(cloud.config(), cloud.user, "comparisons", { prompt: body, responses, device });
      void cloud.flush();
      return { responses, saved };
    }),
  };
  // sent 결과는 동기적으로 접근할 수 있도록 채워 넣는다
  void sentPromise.then((results) => {
    outcome.sent = results;
    outcome.okCount = Object.values(results).filter((r) => r.ok).length;
    outcome.ms = Math.round(performance.now() - t0);
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
