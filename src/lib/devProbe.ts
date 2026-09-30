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
  /** 기준 스냅샷의 원본 (중지 버튼이 전송 직후부터 있었던 경우를 찾기 위해) */
  baselineButtons: ProbeButton[];
  appeared: Record<string, { first: number; last: number; button: ProbeButton }>;
  /** 기준에는 있었는데 사라진 요소 (전송 버튼→중지 버튼 교체 단서) */
  vanished: Record<string, { at: number; button: ProbeButton }>;
  streamingSeen: number[];
  /** 서비스 JSON의 generating 셀렉터가 참이었던 시각들 */
  generatingSeen: number[];
  startedAt: number;
}

/** 버튼·role=button·aria-label 요소·mat-icon 을 모두 본다 (Gemini는 Material 아이콘 ligature 텍스트가 단서) */
const PROBE_JS = `(() => {
  const seen = new Set();
  const buttons = [...document.querySelectorAll('button, [role="button"], [aria-label], mat-icon')]
    .filter((b) => (b.offsetWidth || b.offsetHeight) && !seen.has(b) && seen.add(b))
    .map((b) => ({ aria: b.getAttribute('aria-label') || '', tid: b.getAttribute('data-testid') || '', cls: (b.tagName.toLowerCase() + ' ' + String(b.className || '')).slice(0, 120), txt: (b.innerText || b.textContent || '').trim().slice(0, 30) }));
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

/** 관찰 tick마다 호출. generatingNow: 서비스 JSON의 generating 셀렉터 판정값(있으면) */
export async function probeGenerating(serviceId: string, generatingNow?: boolean) {
  const snap = await evalInPanel<ProbeSnapshot>(serviceId, PROBE_JS, 3000).catch(() => null);
  if (!snap) return;
  const now = Date.now();
  let rec = records[serviceId];
  if (!rec) {
    rec = records[serviceId] = {
      baseline: snap.buttons.map(key),
      baselineButtons: snap.buttons,
      appeared: {},
      vanished: {},
      streamingSeen: [],
      generatingSeen: [],
      startedAt: now,
    };
    return;
  }
  const base = new Set(rec.baseline);
  const t = Math.round((now - rec.startedAt) / 100) / 10;
  const current = new Set<string>();
  for (const b of snap.buttons) {
    const k = key(b);
    current.add(k);
    if (base.has(k)) continue;
    const a = rec.appeared[k];
    if (a) a.last = t;
    else rec.appeared[k] = { first: t, last: t, button: b };
  }
  for (const b of rec.baselineButtons) {
    const k = key(b);
    if (!current.has(k) && !rec.vanished[k]) rec.vanished[k] = { at: t, button: b };
  }
  if (snap.streaming.includes("true")) rec.streamingSeen.push(t);
  if (generatingNow) rec.generatingSeen.push(t);
}
