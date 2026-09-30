/**
 * 개발 빌드 전용 테스트 하네스.
 * 앱 데이터 폴더의 dev_commands.json에 명령을 쓰면 실행하고 dev_results.json에 결과를 남긴다.
 * import.meta.env.DEV 에서만 시작되므로 dmg(프로덕션)에는 동작하지 않는다.
 *
 * dev_commands.json: { "id": "c1", "type": "broadcast", "text": "..." }
 * types: status | broadcast | pipeline | last_pipeline | set_mode | set_role | set_lens | judge | diagnose | memo | apply_stage | set_columns
 *        | maximize | select_in_panel | eval | attach | add_web_slot | remove_web_slot
 */
import { readStore, writeStore } from "./store";
import { runBroadcastAndWaitSent } from "./broadcast";
import { runPipeline } from "./pipeline";
import { resolvePipelineRoles, type PanelRole, type SendMode } from "./roles";
import type { Judged } from "./lenses";
import { usePipelineResult } from "../store/pipelineResult";
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
  /** 클라이언트가 쓴 시각(ms). 60초 넘은 명령은 무시 — 앱 재시작 시 옛 명령이 재실행되는 사고 방지 */
  at?: number;
  [k: string]: unknown;
}
const MAX_COMMAND_AGE_MS = 60_000;

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
        mode: stage.mode,
        roles: stage.roles,
        lensAssign: stage.lensAssign,
      };
    case "broadcast": {
      const o = await runBroadcastAndWaitSent(String(cmd.text));
      if (!o) return { error: "nothing to send" };
      const waitCompletion = cmd.wait === true;
      const done = waitCompletion ? await o.completion : null;
      return { sent: o.sent, okCount: o.okCount, ms: o.ms, completion: done };
    }
    case "pipeline": {
      const steps: string[] = [];
      const r = await runPipeline(String(cmd.text), (step, detail) => steps.push(`${step}: ${detail}`));
      usePipelineResult.getState().set(r);
      return {
        ...r,
        steps,
        verifiers: r.verifiers.map((v) => ({ ...v, lens: v.lens.id, text: v.text.slice(0, 400) })),
      };
    }
    case "last_pipeline": {
      const r = usePipelineResult.getState().result;
      return r ? { ...r, verifiers: r.verifiers.map((v) => ({ ...v, lens: v.lens.id, text: v.text.slice(0, 400) })) } : null;
    }
    case "set_lens":
      stage.setLens(String(cmd.serviceId), String(cmd.lensId));
      return { lensAssign: useStage.getState().lensAssign };
    case "judge": {
      const res = await usePipelineResult.getState().judge(String(cmd.serviceId), cmd.judged as Judged);
      const r = usePipelineResult.getState().result;
      return { result: res, rowId: r?.rowId, judged: r?.verifiers.map((v) => [v.serviceId, v.verdict.judged]) };
    }
    case "set_mode":
      stage.setMode(cmd.mode as SendMode);
      return { mode: useStage.getState().mode };
    case "set_role": {
      stage.setRole(String(cmd.serviceId), cmd.role as PanelRole);
      const s = useStage.getState();
      const resolved = resolvePipelineRoles(s.stage, s.roles, s.services);
      return { roles: s.roles, generator: resolved.generator?.id ?? null, verifiers: resolved.verifiers.map((v) => v.id), error: resolved.error };
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

/** 긴 명령(pipeline·broadcast)이 도는 동안에도 실행해도 되는 읽기 전용 명령 */
const CONCURRENT_TYPES = new Set(["status", "eval", "last_pipeline"]);

async function tick() {
  const cmd = await readStore<Command>("dev_commands").catch(() => null);
  if (!cmd || !cmd.id || cmd.id === lastId) return;
  if (running && !CONCURRENT_TYPES.has(cmd.type)) return;
  if (cmd.at && Date.now() - cmd.at > MAX_COMMAND_AGE_MS) {
    lastId = cmd.id; // 오래된 명령은 소비만 하고 실행하지 않는다
    return;
  }
  const concurrent = CONCURRENT_TYPES.has(cmd.type);
  if (!concurrent) running = true;
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
  if (!concurrent) running = false;
}

declare global {
  interface Window {
    __jilseoHarnessTimer?: number;
  }
}

/** HMR로 모듈이 교체되어도 루프는 하나만 유지한다 (이중 실행 시 옛 코드가 명령을 가로챔) */
export function startDevHarness() {
  if (!import.meta.env.DEV) return;
  if (window.__jilseoHarnessTimer) clearInterval(window.__jilseoHarnessTimer);
  // 시작 시점에 이미 처리된 명령을 다시 실행하지 않도록 마지막 결과 id를 넘겨받는다
  void readStore<{ id?: string }>("dev_results")
    .then((r) => {
      if (r?.id && r.id !== "diag" && r.id !== "fatal") lastId = r.id;
    })
    .catch(() => {});
  window.__jilseoHarnessTimer = window.setInterval(() => void tick(), 1500);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (window.__jilseoHarnessTimer) clearInterval(window.__jilseoHarnessTimer);
    window.__jilseoHarnessTimer = undefined;
  });
}
