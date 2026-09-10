import { useEffect, useRef, useState } from "react";
import { DAY1_SERVICE_IDS, SERVICES } from "./services";
import {
  createPanel,
  layoutPanels,
  measureViewportInset,
  rectOf,
  type ViewportInset,
} from "./lib/panels";

type PanelStatus = "pending" | "ready" | "error";

const stageServices = SERVICES.filter((s) =>
  (DAY1_SERVICE_IDS as readonly string[]).includes(s.id),
);

export default function App() {
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const insetRef = useRef(0);
  const [inset, setInset] = useState<ViewportInset | null>(null);
  const [status, setStatus] = useState<Record<string, PanelStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pushLayout = () => {
    const layouts = stageServices
      .map((svc) => {
        const el = slotRefs.current[svc.id];
        return el ? { service_id: svc.id, rect: rectOf(el, insetRef.current) } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    layoutPanels(layouts).catch(() => {});
  };

  // 인셋 측정 → 패널 생성 (Rust 쪽은 같은 id 재호출 시 무시)
  useEffect(() => {
    let cancelled = false;
    measureViewportInset()
      .catch(() => ({ top: 0, nativeInnerHeight: 0, domHeight: 0 }) as ViewportInset)
      .then((m) => {
        if (cancelled) return;
        insetRef.current = m.top;
        setInset(m);
        for (const svc of stageServices) {
          const el = slotRefs.current[svc.id];
          if (!el) continue;
          setStatus((s) => ({ ...s, [svc.id]: "pending" }));
          createPanel(svc.id, svc.url, rectOf(el, m.top))
            .then(() => setStatus((s) => ({ ...s, [svc.id]: "ready" })))
            .catch((e) => {
              setStatus((s) => ({ ...s, [svc.id]: "error" }));
              setErrors((s) => ({ ...s, [svc.id]: String(e) }));
            });
        }
        pushLayout();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 슬롯 크기·위치 변화 → 인셋 재측정 후 패널 재배치
  useEffect(() => {
    const onChange = () => {
      measureViewportInset()
        .then((m) => {
          insetRef.current = m.top;
          setInset(m);
        })
        .catch(() => {})
        .finally(pushLayout);
    };
    const ro = new ResizeObserver(onChange);
    for (const el of Object.values(slotRefs.current)) if (el) ro.observe(el);
    window.addEventListener("resize", onChange);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onChange);
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-3 text-xs text-white/60">
        <span className="font-medium text-white/80">질서 疾書 · Day 1 검증</span>
        <span className="font-mono text-[10px] text-white/35">
          {inset
            ? `native=${inset.nativeInnerHeight} dom=${inset.domHeight} inset=${inset.top}`
            : "measuring…"}
        </span>
        <span>세 서비스 로그인 → 앱 재시작 → 로그인 유지 확인</span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-3 gap-[2px] bg-white/10 p-[2px]">
        {stageServices.map((svc) => (
          <section key={svc.id} className="flex min-h-0 flex-col bg-[#0f1115]">
            <div className="flex h-7 shrink-0 items-center gap-2 px-2 text-[11px] text-white/60">
              <span className="font-medium text-white/85">{svc.name}</span>
              <span className="truncate text-white/35">{svc.url}</span>
              <span className="ml-auto">
                {status[svc.id] === "ready" && <span className="text-emerald-400">●</span>}
                {status[svc.id] === "pending" && <span className="text-amber-400">●</span>}
                {status[svc.id] === "error" && (
                  <span className="text-rose-400" title={errors[svc.id]}>● 실패</span>
                )}
              </span>
            </div>
            {/* 이 영역의 좌표에 네이티브 webview가 올라간다 */}
            <div
              ref={(el) => {
                slotRefs.current[svc.id] = el;
              }}
              className="min-h-0 flex-1"
            />
          </section>
        ))}
      </main>

      <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-white/10 px-3">
        {SERVICES.map((svc) => {
          const onStage = stageServices.some((s) => s.id === svc.id);
          return (
            <span
              key={svc.id}
              className={
                "rounded-full border px-3 py-1 text-xs " +
                (onStage
                  ? "border-white/30 bg-white/10 text-white/90"
                  : "border-white/10 text-white/30")
              }
            >
              {svc.name}
            </span>
          );
        })}
        <span className="ml-auto text-[11px] text-white/35">Dock · Phase 1에서 토글 활성화</span>
      </footer>
    </div>
  );
}
