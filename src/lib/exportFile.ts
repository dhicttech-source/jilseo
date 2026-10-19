import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { exportStamp } from "./exportMarkdown";

/** Markdown을 앱 데이터 폴더 exports/에 저장하고 Finder/탐색기에서 보여 준다. 반환: 저장 경로 */
export async function saveExport(markdown: string, kind: "pipeline" | "broadcast", at = Date.now()): Promise<string> {
  const path = await invoke<string>("write_export", { name: `${exportStamp(at)}_${kind}.md`, content: markdown });
  revealItemInDir(path).catch(() => {});
  return path;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const openExportsDir = () => invoke<string>("exports_dir").then((p) => revealItemInDir(p)).catch(() => {});
