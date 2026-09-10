import { useEffect, useRef, useState } from "react";
import type { ServiceDef } from "../adapters";
import { createPanel, evalInPanel, layoutPanels, navigatePanel, panelUrl, rectOf, setPanelVisible } from "../lib/panels";
import { insertOrQueue } from "../lib/supabase";
import { useCloud } from "../store/cloud";
import { useStage } from "../store/stage";
import { useWorkstations } from "../store/workstations";

/** 현재 선택 → 없으면 init script가 기록해 둔 최근 선택(60초 이내) */
const SELECTION_JS = `(() => {
  const live = String(window.getSelection ? window.getSelection().toString() : '');
  if (live.trim()) return JSON.stringify({ text: live, source: 'live' });
  const last = window.__jilseoSel;
  if (last && Date.now() - last.at < 60000) return JSON.stringify({ text: last.text, source: 'last' });
  return JSON.stringify({ text: '' });
})()`;

const PHASE_LABEL: Record<string, string> = {
  creating: "생성 중",
  ready: "대기",
  queued: "대기열",
  inserting: "입력 중",
  submitting: "전송 중",
  sent: "전송됨",
  responding: "응답 중",
  done: "응답 완료",
  error: "실패",
};

const PHASE_COLOR: Record<string, string> = {
  creating: "text-amber-400",
  ready: "text-emerald-400",
  queued: "text-sky-400",
  inserting: "text-sky-400",
  submitting: "text-sky-400",
  sent: "text-emerald-400",
  responding: "text-violet-400",
  done: "text-emerald-400",
  error: "text-rose-400",
};

/** 슬롯 하나 = 네이티브 webview가 올라가는 영역 + 헤더. 마운트 시 표시, 언마운트 시 숨김. */
export function PanelSlot({ service }: { service: ServiceDef }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const insetTop = useStage((s) => s.insetTop);
  const status = useStage((s) => s.status[service.id]);
  const maximized = useStage((s) => s.maximized);
  const setMaximized = useStage((s) => s.setMaximized);
  const setStatus = useStage((s) => s.setStatus);
  const toggleStage = useStage((s) => s.toggleStage);
  const isMax = maximized === service.id;
  const [note, setNote] = useState<string | null>(null);

  /** 패널 내 선택 텍스트 → 메모 (서비스·대화 URL·시각 자동) */
  const saveNote = async () => {
    try {
      const { text } = await evalInPanel<{ text: string }>(service.id, SELECTION_JS, 3000);
      if (!text.trim()) {
        setNote("선택된 텍스트 없음 — 패널에서 드래그로 선택한 뒤 눌러주세요");
        setTimeout(() => setNote(null), 4000);
        return;
      }
      const url = await panelUrl(service.id).catch(() => null);
      const user = useCloud.getState().user;
      const res = await insertOrQueue(useCloud.getState().config(), "notes", {
        service_id: service.id,
        conversation_url: url,
        content: text,
        created_at: new Date().toISOString(),
        ...(user ? { user_id: user.id } : {}),
      });
      setNote(res === "saved" ? `메모 저장 (${text.length}자)` : `메모 큐에 저장 (${text.length}자)`);
      void useCloud.getState().flush();
    } catch (e) {
      setNote(`메모 실패: ${String(e).slice(0, 40)}`);
    }
    setTimeout(() => setNote(null), 4000);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    setStatus(service.id, "creating");
    createPanel(service.id, service.url, rectOf(el, useStage.getState().insetTop))
      .then(async () => {
        if (!alive) return;
        await setPanelVisible(service.id, true).catch(() => {});
        await layoutPanels([{ service_id: service.id, rect: rectOf(el, useStage.getState().insetTop) }]).catch(() => {});
        // 워크스테이션 복원: 이 패널에 예약된 대화 URL이 있으면 이동
        const pending = useWorkstations.getState().takePendingUrl(service.id);
        if (pending) await navigatePanel(service.id, pending).catch(() => {});
        setStatus(service.id, "ready");
      })
      .catch((e) => alive && setStatus(service.id, "error", String(e)));

    const push = () =>
      layoutPanels([{ service_id: service.id, rect: rectOf(el, useStage.getState().insetTop) }]).catch(() => {});
    const ro = new ResizeObserver(push);
    ro.observe(el);
    return () => {
      alive = false;
      ro.disconnect();
      setPanelVisible(service.id, false).catch(() => {});
    };
  }, [service.id, service.url]);

  // 인셋 변화(창 리사이즈 등) → 재배치
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    layoutPanels([{ service_id: service.id, rect: rectOf(el, insetTop) }]).catch(() => {});
  }, [insetTop, service.id]);

  const phase = status?.phase ?? "creating";
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-[#0f1115]">
      <div className="flex h-7 shrink-0 items-center gap-2 px-2 text-[11px] text-white/60">
        <span className="font-medium text-white/85">{service.name}</span>
        <span className={PHASE_COLOR[phase]} title={status?.detail}>
          ● {PHASE_LABEL[phase]}
          {phase === "error" && status?.detail ? ` · ${status.detail.slice(0, 60)}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {note && <span className="text-[10px] text-sky-300">{note}</span>}
          <button
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
            title="패널에서 선택한 텍스트를 메모로 저장"
            onClick={() => void saveNote()}
          >
            메모
          </button>
          <button
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
            title={isMax ? "복귀" : "최대화"}
            onClick={() => setMaximized(isMax ? null : service.id)}
          >
            {isMax ? "⤡" : "⤢"}
          </button>
          <button
            className="rounded px-1.5 py-0.5 hover:bg-white/10"
            title="스테이지에서 내리기"
            onClick={() => toggleStage(service.id)}
          >
            ✕
          </button>
        </span>
      </div>
      <div ref={ref} className="min-h-0 flex-1" />
    </section>
  );
}
