/**
 * 개발 빌드 전용 테스트 하네스.
 * 앱 데이터 폴더의 dev_commands.json에 명령을 쓰면 실행하고 dev_results.json에 결과를 남긴다.
 * import.meta.env.DEV 에서만 시작되므로 dmg(프로덕션)에는 동작하지 않는다.
 *
 * dev_commands.json: { "id": "c1", "type": "broadcast", "text": "..." }
 * types: status | broadcast | diagnose | memo | apply_stage | set_columns | maximize | select_in_panel | eval | attach
 */
import { readStore, writeStore } from "./store";
import { runBroadcastAndWaitSent } from "./broadcast";
import { saveNoteFor } from "./notes";
import { evalInPanel } from "./panels";
import { runDiagnostics } from "./diagnostics";
import { invoke } from "@tauri-apps/api/core";
import { useStage } from "../store/stage";
import { useCloud } from "../store/cloud";
import { useAttachment } from "../store/attachment";
import type { Attachment } from "../adapters";

interface Command {
  id: string;
  type: string;
  [k: string]: unknown;
}

let running = false;
let lastId: string | null = null;

async function execute(cmd: Command): Promise<unknown> {
  const stage = useStage.getState();
  switch (cmd.type) {
    case "status":
      return {
        stage: stage.stage,
        columns: stage.columns,
        maximized: stage.maximized,
        status: stage.status,
        cloud: useCloud.getState().status,
        queued: useCloud.getState().queued,
      };
    case "broadcast": {
      const o = await runBroadcastAndWaitSent(String(cmd.text));
      if (!o) return { error: "nothing to send" };
      const waitCompletion = cmd.wait === true;
      const done = waitCompletion ? await o.completion : null;
      return { sent: o.sent, okCount: o.okCount, ms: o.ms, completion: done };
    }
    case "diagnose": {
      const targets = stage.stage.map((id) => stage.services.find((s) => s.id === id)!).filter(Boolean);
      return await runDiagnostics(targets);
    }
    case "memo":
      return await saveNoteFor(String(cmd.serviceId));
    case "apply_stage":
      stage.applyLayout(cmd.stage as string[], cmd.columns as number | undefined);
      return { stage: useStage.getState().stage };
    case "set_columns":
      stage.setColumns(Number(cmd.columns));
      return { columns: useStage.getState().columns };
    case "maximize":
      stage.setMaximized((cmd.serviceId as string | null) ?? null);
      return { maximized: useStage.getState().maximized };
    case "select_in_panel":
      // 테스트용: 응답 컨테이너 텍스트를 프로그램적으로 선택 (메모 흐름 검증)
      return await evalInPanel(
        String(cmd.serviceId),
        `(() => { const els = document.querySelectorAll(${JSON.stringify(String(cmd.selector))}); const el = els[els.length-1]; if (!el) return JSON.stringify({ok:false}); const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return JSON.stringify({ ok: true, length: s.toString().length }); })()`,
      );
    case "attach": {
      const file = await invoke<Attachment>("read_file_base64", { path: String(cmd.path) });
      useAttachment.getState().set(file);
      return { name: file.name, mime: file.mime, size: file.size };
    }
    case "add_web_slot":
      return { id: stage.addWebSlot(String(cmd.url), cmd.name as string | undefined), stage: useStage.getState().stage };
    case "remove_web_slot":
      stage.removeWebSlot(String(cmd.id));
      return { stage: useStage.getState().stage };
    case "eval":
      return await evalInPanel(String(cmd.serviceId), String(cmd.js), Number(cmd.timeoutMs ?? 10000));
    default:
      return { error: `unknown command type: ${cmd.type}` };
  }
}

async function tick() {
  if (running) return;
  const cmd = await readStore<Command>("dev_commands").catch(() => null);
  if (!cmd || !cmd.id || cmd.id === lastId) return;
  running = true;
  lastId = cmd.id;
  const started = Date.now();
  let result: unknown;
  let ok = true;
  try {
    result = await execute(cmd);
  } catch (e) {
    ok = false;
    result = { error: e instanceof Error ? e.message : String(e) };
  }
  await writeStore("dev_results", { id: cmd.id, type: cmd.type, ok, result, started, finished: Date.now() }).catch(() => {});
  running = false;
}

export function startDevHarness() {
  if (!import.meta.env.DEV) return;
  setInterval(() => void tick(), 1500);
}
