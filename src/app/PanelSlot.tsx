import { useEffect, useRef, useState } from "react";
import type { ServiceDef } from "../adapters";
import { createPanel, layoutPanels, navigatePanel, rectOf, setPanelVisible } from "../lib/panels";
import { saveNoteFor } from "../lib/notes";
import { BUILTIN_LENSES, COMPOSITE_LENS_ID } from "../lib/lenses";
import { effectiveRole, nextRole, resolvePipelineRoles, type PanelRole } from "../lib/roles";
import { useStage } from "../store/stage";
import { useWorkstations } from "../store/workstations";

const PHASE_LABEL: Record<string, string> = {
  creating: "생성 중",
  ready: "대기",
  queued: "대기열",
  attaching: "첨부 중",
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
  attaching: "text-sky-400",
  inserting: "text-sky-400",
  submitting: "text-sky-400",
  sent: "text-emerald-400",
  responding: "text-violet-400",
  done: "text-emerald-400",
  error: "text-rose-400",
};

const ROLE_LABEL: Record<PanelRole, string> = { generate: "생성", verify: "검증", off: "제외" };
const ROLE_CLASS: Record<PanelRole, string> = {
  generate: "border-emerald-400/50 bg-emerald-400/15 text-emerald-200",
  verify: "border-sky-400/50 bg-sky-400/15 text-sky-200",
  off: "border-white/15 text-white/35",
};

/** 검증 패널의 렌즈 선택. 권장 서비스면 이름 뒤에 ✓ */
function LensSelect({ serviceId }: { serviceId: string }) {
  const lensAssign = useStage((s) => s.lensAssign);
  const customLenses = useStage((s) => s.customLenses);
  const setLens = useStage((s) => s.setLens);
  const current = lensAssign[serviceId] ?? COMPOSITE_LENS_ID;
  const all = [...BUILTIN_LENSES, ...customLenses];
  const cur = all.find((l) => l.id === current) ?? BUILTIN_LENSES[0];
  return (
    <select
      value={cur.id}
      onChange={(e) => setLens(serviceId, e.target.value)}
      title={`검증 렌즈: ${cur.description}`}
      className="max-w-28 rounded border border-white/15 bg-white/5 px-1 py-0.5 text-xs text-white/80 outline-none"
    >
      {all.map((l) => (
        <option key={l.id} value={l.id} className="bg-[#1a1d24]">
          {l.icon} {l.name}
          {l.recommended.includes(serviceId) ? " ✓" : ""}
        </option>
      ))}
    </select>
  );
}

/** 파이프라인 모드에서만 보이는 역할 칩. 클릭하면 생성 → 검증 → 제외 순환. 검증이면 렌즈 선택이 따라붙는다 */
function RoleChip({ serviceId }: { serviceId: string }) {
  const stage = useStage((s) => s.stage);
  const roles = useStage((s) => s.roles);
  const services = useStage((s) => s.services);
  const setRole = useStage((s) => s.setRole);
  const role = effectiveRole(serviceId, resolvePipelineRoles(stage, roles, services));
  return (
    <>
      <button
        onClick={() => setRole(serviceId, nextRole(role))}
        title="파이프라인 역할 (클릭: 생성 → 검증 → 제외)"
        className={"rounded-full border px-2 py-0.5 text-xs " + ROLE_CLASS[role]}
      >
        {ROLE_LABEL[role]}
      </button>
      {role === "verify" && <LensSelect serviceId={serviceId} />}
    </>
  );
}

/** 슬롯 하나 = 네이티브 webview가 올라가는 영역 + 헤더. 마운트 시 표시, 언마운트 시 숨김. */
export function PanelSlot({ service }: { service: ServiceDef }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const insetTop = useStage((s) => s.insetTop);
  const status = useStage((s) => s.status[service.id]);
  const maximized = useStage((s) => s.maximized);
  const setMaximized = useStage((s) => s.setMaximized);
  const setStatus = useStage((s) => s.setStatus);
  const toggleStage = useStage((s) => s.toggleStage);
  const mode = useStage((s) => s.mode);
  const isMax = maximized === service.id;
  const [note, setNote] = useState<string | null>(null);

  const saveNote = async () => {
    try {
      const r = await saveNoteFor(service.id);
      setNote(r.message);
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
      <div className="flex h-9 shrink-0 items-center gap-2 px-2.5 text-sm text-white/65">
        <span className="font-semibold text-white/90">{service.name}</span>
        {service.kind === "web" && <span className="rounded bg-white/10 px-1.5 text-xs text-white/50">웹</span>}
        {mode === "pipeline" && service.kind !== "web" && <RoleChip serviceId={service.id} />}
        <span className={PHASE_COLOR[phase]} title={status?.detail}>
          ● {PHASE_LABEL[phase]}
          {phase === "error" && status?.detail ? ` · ${status.detail.slice(0, 60)}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {note && <span className="text-xs text-sky-300">{note}</span>}
          <button
            className="rounded px-2 py-1 hover:bg-white/10"
            title="패널에서 선택한 텍스트를 메모로 저장"
            onClick={() => void saveNote()}
          >
            메모
          </button>
          <button
            className="rounded px-2 py-1 text-base leading-none hover:bg-white/10"
            title={isMax ? "복귀" : "최대화"}
            onClick={() => setMaximized(isMax ? null : service.id)}
          >
            {isMax ? "⤡" : "⤢"}
          </button>
          <button
            className="rounded px-2 py-1 text-base leading-none hover:bg-white/10"
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
