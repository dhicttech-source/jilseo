/**
 * 개발 빌드 전용: 응답 관찰 중 패널의 "생성 중" 표시(중지 버튼 등)를 실측한다.
 * 첫 관찰 때의 버튼 집합을 기준으로, 생성 중에 새로 나타난 버튼과 data-is-streaming 값을 누적해
 * 하네스 `probes` 명령으로 꺼내 본다. 프로덕션에서는 호출되지 않는다 (import.meta.env.DEV 가드).
 */
import { evalInPanel } from "./panels";

interface ProbeButton {
  aria: string;
  tid: string;
  cls: string;
  txt: string;
}
interface ProbeSnapshot {
  buttons: ProbeButton[];
  streaming: string[];
}
export interface ProbeRecord {
  baseline: string[];
  appeared: Record<string, { first: number; last: number; button: ProbeButton }>;
  streamingSeen: number[];
  startedAt: number;
}

const PROBE_JS = `(() => {
  const buttons = [...document.querySelectorAll('button, [role="button"]')]
    .filter((b) => b.offsetWidth || b.offsetHeight)
    .map((b) => ({ aria: b.getAttribute('aria-label') || '', tid: b.getAttribute('data-testid') || '', cls: String(b.className || '').slice(0, 120), txt: (b.innerText || '').trim().slice(0, 30) }));
  const streaming = [...document.querySelectorAll('[data-is-streaming]')].map((e) => e.getAttribute('data-is-streaming') || '');
  return JSON.stringify({ buttons, streaming });
})()`;

const key = (b: ProbeButton) => `${b.aria}|${b.tid}|${b.cls}|${b.txt}`;
const records: Record<string, ProbeRecord> = {};

export const probeRecords = () => records;

/** 관찰 시작 시 호출: 기준 스냅샷 초기화 */
export function resetProbe(serviceId: string) {
  delete records[serviceId];
}

/** 관찰 tick마다 호출 */
export async function probeGenerating(serviceId: string) {
  const snap = await evalInPanel<ProbeSnapshot>(serviceId, PROBE_JS, 3000).catch(() => null);
  if (!snap) return;
  const now = Date.now();
  let rec = records[serviceId];
  if (!rec) {
    rec = records[serviceId] = { baseline: snap.buttons.map(key), appeared: {}, streamingSeen: [], startedAt: now };
    return;
  }
  const base = new Set(rec.baseline);
  const t = Math.round((now - rec.startedAt) / 100) / 10;
  for (const b of snap.buttons) {
    const k = key(b);
    if (base.has(k)) continue;
    const a = rec.appeared[k];
    if (a) a.last = t;
    else rec.appeared[k] = { first: t, last: t, button: b };
  }
  if (snap.streaming.includes("true")) rec.streamingSeen.push(t);
}
