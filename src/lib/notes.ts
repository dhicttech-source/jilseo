import { evalInPanel, panelUrl } from "./panels";
import { saveRow } from "./supabase";
import { useCloud } from "../store/cloud";

/** 현재 선택 → 없으면 init script가 기록해 둔 최근 선택(60초 이내) */
const SELECTION_JS = `(() => {
  const live = String(window.getSelection ? window.getSelection().toString() : '');
  if (live.trim()) return JSON.stringify({ text: live, source: 'live' });
  const last = window.__jilseoSel;
  if (last && Date.now() - last.at < 60000) return JSON.stringify({ text: last.text, source: 'last' });
  return JSON.stringify({ text: '' });
})()`;

export interface NoteResult {
  ok: boolean;
  message: string;
  length?: number;
  saved?: "saved" | "queued";
}

/** 패널 내 선택 텍스트 → 메모 (서비스·대화 URL·시각 자동 기록) */
export async function saveNoteFor(serviceId: string): Promise<NoteResult> {
  const { text } = await evalInPanel<{ text: string }>(serviceId, SELECTION_JS, 3000);
  if (!text.trim()) return { ok: false, message: "선택된 텍스트 없음 — 패널에서 드래그로 선택한 뒤 눌러주세요" };
  const url = await panelUrl(serviceId).catch(() => null);
  const cloud = useCloud.getState();
  const saved = await saveRow(cloud.config(), cloud.user, "notes", {
    service_id: serviceId,
    conversation_url: url,
    content: text,
  });
  void cloud.flush();
  return {
    ok: true,
    saved,
    length: text.length,
    message: saved === "saved" ? `메모 저장 (${text.length}자)` : `메모 큐에 저장 (${text.length}자)`,
  };
}
