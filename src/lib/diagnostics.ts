import { invoke } from "@tauri-apps/api/core";
import { ServiceAdapter, isTodoSelector, type ProbeResult, type ServiceDef } from "../adapters";
import { evalInPanel } from "./panels";
import { readResponseJs } from "../inject/runtime";

export interface PanelDiagnostic {
  id: string;
  probe?: ProbeResult;
  response?: { count: number; length: number; text: string };
  error?: string;
}

/** 스테이지 패널 전부에 대해 셀렉터 존재·가시성과 마지막 응답 스냅샷을 수집해 파일로 기록 */
export async function runDiagnostics(targets: ServiceDef[]): Promise<{ path: string; items: PanelDiagnostic[] }> {
  const items: PanelDiagnostic[] = [];
  for (const def of targets) {
    const item: PanelDiagnostic = { id: def.id };
    try {
      item.probe = await new ServiceAdapter(def).probe();
      if (!isTodoSelector(def.selectors.response)) {
        const r = await evalInPanel<{ count: number; length: number; text: string }>(
          def.id,
          readResponseJs(def.selectors.response),
          5000,
        );
        item.response = { ...r, text: r.text.slice(0, 1500) };
      }
    } catch (e) {
      item.error = e instanceof Error ? e.message : String(e);
    }
    items.push(item);
  }
  const path = await invoke<string>("write_diagnostics", {
    report: { at: new Date().toISOString(), items },
  });
  return { path, items };
}

/** 헤더에 띄울 한 줄 요약: id:input✓send✓resp(3) 형태 */
export function summarize(items: PanelDiagnostic[]): string {
  return items
    .map((it) => {
      if (it.error) return `${it.id}:오류`;
      const s = it.probe?.selectors ?? {};
      const mark = (k: string) => (s[k]?.found ? "✓" : "✗");
      return `${it.id}:입력${mark("input")} 전송${mark("send")} 응답${it.response?.count ?? 0}`;
    })
    .join("  ");
}
