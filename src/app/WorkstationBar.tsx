import { useState } from "react";
import { useWorkstations } from "../store/workstations";

/** 헤더 안 워크스테이션 칩: 클릭=전환, 저장=현재 구성+대화 URL 캡처 */
export function WorkstationBar() {
  const list = useWorkstations((s) => s.list);
  const activeId = useWorkstations((s) => s.activeId);
  const apply = useWorkstations((s) => s.apply);
  const saveCurrent = useWorkstations((s) => s.saveCurrent);
  const remove = useWorkstations((s) => s.remove);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const commit = async () => {
    await saveCurrent(name);
    setName("");
    setNaming(false);
  };

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {list.map((w) => (
        <span key={w.id} className="group flex items-center">
          <button
            onClick={() => void apply(w.id)}
            title={`${w.panels.map((p) => p.serviceId).join(" · ")}\n${new Date(w.updatedAt).toLocaleString()}`}
            className={
              "rounded-l-full border px-2.5 py-0.5 text-[11px] " +
              (activeId === w.id
                ? "border-sky-400/50 bg-sky-400/15 text-sky-200"
                : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80")
            }
          >
            {w.name}
          </button>
          <button
            onClick={() => void saveCurrent(w.name, w.id)}
            title="현재 구성으로 덮어쓰기"
            className="border-y border-white/10 px-1.5 py-0.5 text-[10px] text-white/30 hover:bg-white/10 hover:text-white/80"
          >
            ↻
          </button>
          <button
            onClick={() => void remove(w.id)}
            title="삭제"
            className="rounded-r-full border border-l-0 border-white/10 px-1.5 py-0.5 text-[10px] text-white/30 hover:bg-rose-500/20 hover:text-rose-300"
          >
            ✕
          </button>
        </span>
      ))}
      {naming ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="이름"
            className="h-5 w-28 rounded border border-white/20 bg-white/5 px-1.5 text-[11px] text-white/90 outline-none"
          />
          <button onClick={() => void commit()} className="rounded bg-white/15 px-2 py-0.5 text-[11px] text-white/90">
            저장
          </button>
        </span>
      ) : (
        <button
          onClick={() => setNaming(true)}
          title="현재 패널 구성과 각 패널의 대화 URL을 워크스테이션으로 저장"
          className="rounded-full border border-dashed border-white/20 px-2.5 py-0.5 text-[11px] text-white/40 hover:border-white/40 hover:text-white/80"
        >
          + 워크스테이션
        </button>
      )}
    </div>
  );
}
