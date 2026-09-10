import { evalInPanel, panelUrl } from "../lib/panels";
import { insertTextJs, probeJs, readResponseJs, submitJs } from "../inject/runtime";

export interface ServiceDef {
  id: string;
  name: string;
  url: string;
  partition: string;
  selectors: { input: string; send: string; response: string; fileInput?: string };
  verified?: string;
}

export const isTodoSelector = (s: string | undefined) => !s || s.startsWith("TODO");

export interface ProbeResult {
  url: string;
  title: string;
  selectors: Record<string, { found: boolean; tag?: string; vis?: boolean }>;
}

/** 지시문 §4 ServiceAdapter. 패널 하나에 대한 DOM 주입 동작만 담당. */
export class ServiceAdapter {
  constructor(readonly def: ServiceDef) {}
  get id() {
    return this.def.id;
  }

  probe(): Promise<ProbeResult> {
    return evalInPanel<ProbeResult>(this.id, probeJs(this.def.selectors), 5000);
  }

  async insertText(text: string): Promise<void> {
    if (isTodoSelector(this.def.selectors.input)) throw new Error("입력창 셀렉터 미실측 (TODO)");
    const r = await evalInPanel<{ ok: boolean; reason?: string }>(
      this.id,
      insertTextJs(this.def.selectors.input, text),
      5000,
    );
    if (!r.ok) throw new Error(r.reason ?? "insertText failed");
  }

  async submit(): Promise<string> {
    const r = await evalInPanel<{ ok: boolean; method?: string; reason?: string }>(
      this.id,
      submitJs(this.def.selectors.send, this.def.selectors.input),
      5000,
    );
    if (!r.ok) throw new Error(r.reason ?? "submit failed");
    return r.method ?? "unknown";
  }

  /** 응답 DOM이 3초간 변하지 않으면 done. cb는 변화가 있을 때만 호출. */
  observeResponse(
    cb: (text: string, done: boolean) => void,
    opts: { quietMs?: number; pollMs?: number; maxMs?: number; signal?: AbortSignal } = {},
  ): Promise<string> {
    const { quietMs = 3000, pollMs = 700, maxMs = 180_000, signal } = opts;
    const sel = this.def.selectors.response;
    if (isTodoSelector(sel)) return Promise.resolve("");
    return new Promise((resolve) => {
      const start = Date.now();
      let last = "";
      let lastChange = Date.now();
      let seen = false;
      const tick = async () => {
        if (signal?.aborted) return resolve(last);
        try {
          const r = await evalInPanel<{ count: number; length: number; text: string }>(
            this.id,
            readResponseJs(sel),
            3000,
          );
          if (r.text !== last) {
            last = r.text;
            lastChange = Date.now();
            seen = r.length > 0;
            cb(last, false);
          } else if (seen && Date.now() - lastChange >= quietMs) {
            cb(last, true);
            return resolve(last);
          }
        } catch {
          /* 일시 오류는 무시하고 계속 폴링 */
        }
        if (Date.now() - start > maxMs) {
          cb(last, true);
          return resolve(last);
        }
        setTimeout(tick, pollMs);
      };
      setTimeout(tick, pollMs);
    });
  }

  currentConversationUrl(): Promise<string | null> {
    return panelUrl(this.id);
  }
}

export type SendPhase = "queued" | "inserting" | "submitting" | "sent" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.floor(Math.random() * 300); // 지시문 §8: 전송 간격 300ms 랜덤 지터

/**
 * 한 텍스트를 여러 패널에 동시 전송. 패널별로 격리되어 하나가 실패해도 나머지는 진행.
 * 자동 반복 전송 기능은 두지 않는다 (지시문 §8).
 */
export async function broadcastText(
  text: string,
  adapters: ServiceAdapter[],
  report: (id: string, phase: SendPhase, detail?: string) => void,
): Promise<Record<string, { ok: boolean; detail?: string }>> {
  const results: Record<string, { ok: boolean; detail?: string }> = {};
  await Promise.all(
    adapters.map(async (a) => {
      report(a.id, "queued");
      try {
        await sleep(jitter());
        report(a.id, "inserting");
        await a.insertText(text);
        await sleep(150 + jitter());
        report(a.id, "submitting");
        const method = await a.submit();
        report(a.id, "sent", method);
        results[a.id] = { ok: true, detail: method };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        report(a.id, "error", msg);
        results[a.id] = { ok: false, detail: msg };
      }
    }),
  );
  return results;
}
