/**
 * 개발 빌드 전용 테스트 하네스.
 * 앱 데이터 폴더의 dev_commands.json에 명령을 쓰면 실행하고 dev_results.json에 결과를 남긴다.
 * import.meta.env.DEV 에서만 시작되므로 dmg(프로덕션)에는 동작하지 않는다.
 *
 * dev_commands.json: { "id": "c1", "type": "broadcast", "text": "..." }
 * types: status | broadcast | pipeline | last_pipeline | revise | scorecard | ui_eval | set_mode | set_role | set_lens | apply_preset | set_depth | judge | diagnose | memo | apply_stage | set_columns
 *        | maximize | select_in_panel | eval | attach | add_web_slot | remove_web_slot
 */
import { readStore, writeStore } from "./store";
import { runBroadcastAndWaitSent } from "./broadcast";
import { runPipeline } from "./pipeline";
import { resolvePipelineRoles, type PanelRole, type SendMode } from "./roles";
import type { Judged } from "./lenses";
import type { Depth } from "./presets";
import { usePipelineResult } from "../store/pipelineResult";
import { probeRecords } from "./devProbe";
import { useScorecard } from "../store/scorecard";
import { findPreset } from "./presets";
import { recommend } from "./scorecard";
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
        depth: stage.depth,
        presetId: stage.presetId,
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
        revised: r.revised?.slice(0, 600),
        revisedLen: r.revised?.length ?? 0,
        verifiers: r.verifiers.map((v) => ({ ...v, lens: v.lens.id, text: v.text.slice(0, 400) })),
      };
    }
    case "scorecard": {
      const card = await useScorecard.getState().load();
      if (!card) return { error: useScorecard.getState().message };
      const preset = findPreset(String(cmd.presetId ?? ""));
      const rec = preset ? recommend(card, preset, stage.stage.filter((id) => stage.roles[id] !== "generate")) : null;
      return { ...card, recommend: rec };
    }
    case "ui_eval":
      // UI webview 안에서 실행 (화면 전환 등 테스트용). 개발 빌드 전용
      return new Function(String(cmd.js))();
    case "probes":
      return probeRecords();
    case "last_pipeline": {
      const r = usePipelineResult.getState().result;
      return r ? { ...r, verifiers: r.verifiers.map((v) => ({ ...v, lens: v.lens.id, text: v.text.slice(0, 400) })) } : null;
    }
    case "revise": {
      await usePipelineResult.getState().revise();
      const r = usePipelineResult.getState().result;
      return r ? { rowId: r.rowId, revised: r.revised?.slice(0, 600) ?? null, revisedLen: r.revised?.length ?? 0, reviseError: r.reviseError ?? null } : null;
    }
    case "apply_preset": {
      const app = stage.applyPresetToStage(String(cmd.presetId));
      const s = useStage.getState();
      return app ? { ...app, depth: s.depth, presetId: s.presetId } : { error: "unknown preset" };
    }
    case "set_depth":
      stage.setDepth(cmd.depth as Depth);
      return { depth: useStage.getState().depth };
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
const CONCURRENT_TYPES = new Set(["status", "eval", "last_pipeline", "probes", "ui_eval"]);

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
  await writeResult({ id: cmd.id, type: cmd.type, ok, result, started, finished: Date.now() });
  if (!concurrent) running = false;
}

interface ResultEntry {
  id: string;
  type: string;
  ok: boolean;
  result: unknown;
  started: number;
  finished: number;
}
const RECENT_KEEP = 20;

/**
 * 결과 기록. 최신 결과를 최상위에 두고, 최근 결과 RECENT_KEEP개를 `recent[id]`에도 남긴다 —
 * 읽기 전용 명령이 동시에 돌 때 긴 명령의 결과가 덮여 사라지지 않도록 (클라이언트는 id로 recent도 찾는다).
 */
async function writeResult(entry: ResultEntry) {
  const prev = await readStore<{ recent?: Record<string, ResultEntry> }>("dev_results").catch(() => null);
  const recent: Record<string, ResultEntry> = { ...(prev?.recent ?? {}), [entry.id]: entry };
  const ids = Object.values(recent)
    .sort((a, b) => b.finished - a.finished)
    .slice(0, RECENT_KEEP)
    .map((e) => e.id);
  const kept = Object.fromEntries(ids.map((id) => [id, recent[id]]));
  await writeStore("dev_results", { ...entry, recent: kept }).catch(() => {});
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
