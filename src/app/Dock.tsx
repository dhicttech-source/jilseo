import { isTodoSelector } from "../adapters";
import { MAX_PANELS, useStage } from "../store/stage";

export function Dock() {
  const services = useStage((s) => s.services);
  const stage = useStage((s) => s.stage);
  const toggleStage = useStage((s) => s.toggleStage);
  const columns = useStage((s) => s.columns);
  const setColumns = useStage((s) => s.setColumns);
  const full = stage.length >= MAX_PANELS;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t border-white/10 px-3">
      {services.map((svc) => {
        const on = stage.includes(svc.id);
        const todo = isTodoSelector(svc.selectors.input);
        return (
          <button
            key={svc.id}
            onClick={() => toggleStage(svc.id)}
            disabled={!on && full}
            title={todo ? "셀렉터 미실측 — 로그인 후 실측 필요" : svc.url}
            className={
              "rounded-full border px-3 py-1 text-xs transition " +
              (on
                ? "border-white/30 bg-white/10 text-white/90"
                : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70") +
              (!on && full ? " cursor-not-allowed opacity-40" : "")
            }
          >
            {svc.name}
            {todo && <span className="ml-1 text-amber-400">·</span>}
          </button>
        );
      })}
      <span className="ml-auto flex items-center gap-1 text-[11px] text-white/40">
        열
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => setColumns(n)}
            className={
              "h-5 w-5 rounded text-[11px] " +
              (columns === n ? "bg-white/15 text-white/90" : "hover:bg-white/10")
            }
          >
            {n}
          </button>
        ))}
      </span>
    </div>
  );
}
