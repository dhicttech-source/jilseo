import { evalInPanel, panelUrl } from "../lib/panels";
import {
  attachFileJs,
  clickJs,
  clickSendJs,
  escapeJs,
  insertDomJs,
  insertTextJs,
  probeJs,
  readInputJs,
  readResponseHtmlJs,
  readResponseJs,
  requestSubmitJs,
  submitJs,
} from "../inject/runtime";

export interface ServiceDef {
  id: string;
  name: string;
  url: string;
  partition: string;
  selectors: {
    input: string;
    send: string;
    response: string;
    fileInput?: string;
    /** fileInput이 메뉴를 열어야 생기는 경우(Gemini) 먼저 클릭할 버튼 */
    fileMenu?: string;
  };
  verified?: string;
  /** "web": 웹슬롯(일반 URL). Broadcast 대상에서 제외 */
  kind?: "ai" | "web";
  /** 파일을 첨부해 전송한 뒤 응답 수집이 끝나면 새 채팅으로 이동 (ChatGPT: 파일 첨부 대화방에서 이후 응답이 막히는 문제 회피) */
  afterFileBroadcast?: "new_chat";
}

export interface Attachment {
  name: string;
  mime: string;
  size: number;
  /** base64 */
  data: string;
}

export const isBroadcastTarget = (d: ServiceDef) => d.kind !== "web";

export interface ResponseSnapshot {
  count: number;
  text: string;
}

/** 미실측 셀렉터 표기 규칙 (지시문 §9): `TODO(selector)`, `TODO(web)` 등 */
export const TODO_SELECTOR_PREFIX = "TODO";
export const isTodoSelector = (s: string | undefined) => !s || s.startsWith(TODO_SELECTOR_PREFIX);

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
    const r = await evalInPanel<{ ok: boolean; reason?: string; method?: string; pending?: boolean }>(
      this.id,
      insertTextJs(this.def.selectors.input, text),
      5000,
    );
    if (!r.ok) throw new Error(r.reason ?? "insertText failed");
    if (r.pending) {
      // paste 경로: 에디터 반영이 비동기 → 잠시 뒤 실제로 들어갔는지 확인
      await new Promise((res) => setTimeout(res, 700));
      if (await this.inputReflects(text)) return;
      // paste도 무시된 경우(Gemini가 응답 뒤 포커스를 잃으면 execCommand·paste 모두 무시) → DOM 직접 삽입
      const d = await evalInPanel<{ ok: boolean; reason?: string }>(this.id, insertDomJs(this.def.selectors.input, text), 5000);
      if (!d.ok) throw new Error(`insert via paste/dom not reflected${d.reason ? `: ${d.reason}` : ""}`);
    }
  }

  /** 입력창에 텍스트의 앞부분이 실제로 들어갔는지 */
  private async inputReflects(text: string): Promise<boolean> {
    const chk = await evalInPanel<{ text: string }>(this.id, readInputJs(this.def.selectors.input), 3000).catch(() => ({ text: "" }));
    return chk.text.includes(text.slice(0, 20));
  }

  /**
   * 전송. 버튼이 비활성이면(파일 업로드 처리 중 등) 활성화될 때까지 최대 waitMs 동안 재시도한 뒤,
   * 그래도 안 되면 Enter 폴백(submitJs). 합성 Enter를 무시하는 사이트(ChatGPT)가 있어 버튼 클릭이 우선이다.
   */
  async submit(waitMs = 12_000): Promise<string> {
    const deadline = Date.now() + waitMs;
    let lastReason = "";
    const inputSel = this.def.selectors.input;
    const inputStillHasText = async () => {
      const chk = await evalInPanel<{ text: string }>(this.id, readInputJs(inputSel), 3000).catch(() => ({ text: "" }));
      return chk.text.length > 0;
    };
    while (Date.now() < deadline) {
      const r = await evalInPanel<{ ok: boolean; method?: string; reason?: string }>(
        this.id,
        clickSendJs(this.def.selectors.send),
        5000,
      );
      if (r.ok) {
        // click을 무시하는 사이트(Grok) 대비: 잠시 뒤 입력창이 비워졌는지로 실제 전송을 판정
        await new Promise((res) => setTimeout(res, 1200));
        if (!(await inputStillHasText())) return r.method ?? "click";
        const rs = await evalInPanel<{ ok: boolean; method?: string }>(this.id, requestSubmitJs(this.def.selectors.send), 3000).catch(
          () => ({ ok: false }),
        );
        if (rs.ok) {
          await new Promise((res) => setTimeout(res, 1200));
          if (!(await inputStillHasText())) return "requestSubmit";
        }
        break; // Enter 폴백으로
      }
      lastReason = r.reason ?? "";
      if (lastReason === "missing") break; // 버튼 자체가 없으면 기다려도 소용없음
      await new Promise((res) => setTimeout(res, 500));
    }
    const r = await evalInPanel<{ ok: boolean; method?: string; reason?: string }>(
      this.id,
      submitJs(this.def.selectors.send, this.def.selectors.input),
      5000,
    );
    if (!r.ok) throw new Error(r.reason ?? `submit failed (${lastReason})`);
    return r.method ?? "unknown";
  }

  /** 전송 직전의 응답 DOM 스냅샷. 기존 대화의 마지막 응답을 새 응답으로 오인하지 않기 위한 기준점. */
  async snapshotResponse(): Promise<ResponseSnapshot> {
    const sel = this.def.selectors.response;
    if (isTodoSelector(sel)) return { count: 0, text: "" };
    try {
      const r = await evalInPanel<{ count: number; text: string }>(this.id, readResponseJs(sel), 3000);
      return { count: r.count, text: r.text };
    } catch {
      return { count: 0, text: "" };
    }
  }

  /**
   * 응답 관찰. baseline(전송 전 스냅샷)과 다른 새 응답이 나타난 뒤 3초간 변화가 없으면 done.
   * cb는 변화가 있을 때만 호출.
   */
  observeResponse(
    cb: (text: string, done: boolean) => void,
    opts: { quietMs?: number; pollMs?: number; maxMs?: number; signal?: AbortSignal; baseline?: ResponseSnapshot } = {},
  ): Promise<string> {
    const { quietMs = 3000, pollMs = 700, maxMs = 180_000, signal, baseline = { count: 0, text: "" } } = opts;
    const sel = this.def.selectors.response;
    if (isTodoSelector(sel)) return Promise.resolve("");
    return new Promise((resolve) => {
      const start = Date.now();
      let last = "";
      let lastChange = Date.now();
      let seen = false;
      const isNew = (r: { count: number; text: string }) =>
        r.text.length > 0 && (r.count > baseline.count || r.text !== baseline.text);
      const tick = async () => {
        if (signal?.aborted) return resolve(last);
        try {
          const r = await evalInPanel<{ count: number; length: number; text: string }>(
            this.id,
            readResponseJs(sel),
            3000,
          );
          if (!isNew(r)) {
            // 아직 새 응답이 없음(기존 응답 그대로 또는 빈 자리표시자)
          } else if (r.text !== last) {
            last = r.text;
            lastChange = Date.now();
            seen = true;
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

  async readResponseHtml(): Promise<string> {
    const sel = this.def.selectors.response;
    if (isTodoSelector(sel)) return "";
    const r = await evalInPanel<{ html: string }>(this.id, readResponseHtmlJs(sel), 5000);
    return r.html ?? "";
  }

  /** 파일 1개 첨부. 업로드 처리 시간을 위해 호출 뒤 잠시 기다려야 한다 */
  async attachFile(file: Attachment): Promise<string> {
    if (isTodoSelector(this.def.selectors.input)) throw new Error("입력창 셀렉터 미실측 (TODO)");
    const menu = this.def.selectors.fileMenu;
    if (menu && !isTodoSelector(menu)) {
      // 메뉴를 열어야 file input이 DOM에 생기는 사이트. 열고 잠시 기다린 뒤 첨부, 끝나면 Escape로 닫는다.
      await evalInPanel(this.id, clickJs(menu), 3000).catch(() => {});
      await new Promise((res) => setTimeout(res, 600));
    }
    const r = await evalInPanel<{ ok: boolean; method?: string; reason?: string }>(
      this.id,
      attachFileJs(this.def.selectors.fileInput, this.def.selectors.input, file),
      15000,
    );
    if (menu && !isTodoSelector(menu)) {
      await new Promise((res) => setTimeout(res, 300));
      await evalInPanel(this.id, escapeJs(), 3000).catch(() => {});
    }
    if (!r.ok) throw new Error(r.reason ?? "attach failed");
    return r.method ?? "unknown";
  }

  currentConversationUrl(): Promise<string | null> {
    return panelUrl(this.id);
  }
}

export type SendPhase = "queued" | "attaching" | "inserting" | "submitting" | "sent" | "error";

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
  attachment?: Attachment | null,
): Promise<Record<string, { ok: boolean; detail?: string }>> {
  const results: Record<string, { ok: boolean; detail?: string }> = {};
  await Promise.all(
    adapters.map(async (a) => {
      report(a.id, "queued");
      try {
        await sleep(jitter());
        if (attachment) {
          report(a.id, "attaching");
          const method = await a.attachFile(attachment);
          report(a.id, "attaching", method);
          await sleep(2500 + jitter()); // 업로드 처리 대기
        }
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
