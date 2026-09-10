import { useState } from "react";
import { isTodoSelector } from "../adapters";
import { useFavorites } from "../store/favorites";
import { MAX_PANELS, useStage } from "../store/stage";

export function Dock() {
  const services = useStage((s) => s.services);
  const stage = useStage((s) => s.stage);
  const toggleStage = useStage((s) => s.toggleStage);
  const columns = useStage((s) => s.columns);
  const setColumns = useStage((s) => s.setColumns);
  const addWebSlot = useStage((s) => s.addWebSlot);
  const removeWebSlot = useStage((s) => s.removeWebSlot);
  const favorites = useFavorites((s) => s.list);
  const addFavorite = useFavorites((s) => s.add);
  const removeFavorite = useFavorites((s) => s.remove);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const full = stage.length >= MAX_PANELS;

  const submitUrl = () => {
    if (!url.trim()) return;
    const id = addWebSlot(url);
    if (id) {
      setUrl("");
      setUrlOpen(false);
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-white/10 px-3">
      {services.map((svc) => {
        const on = stage.includes(svc.id);
        const todo = svc.kind !== "web" && isTodoSelector(svc.selectors.input);
        const isWeb = svc.kind === "web";
        const fav = favorites.find((f) => f.url === svc.url);
        return (
          <span key={svc.id} className="group flex shrink-0 items-center">
            <button
              onClick={() => toggleStage(svc.id)}
              disabled={!on && full}
              title={todo ? "셀렉터 미실측 — 로그인 후 실측 필요" : svc.url}
              className={
                "border px-3.5 py-1.5 text-sm transition " +
                (isWeb ? "rounded-l-full " : "rounded-full ") +
                (on
                  ? "border-white/30 bg-white/10 text-white/90"
                  : "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70") +
                (!on && full ? " cursor-not-allowed opacity-40" : "")
              }
            >
              {isWeb && <span className="mr-1 text-white/40">🌐</span>}
              {svc.name}
              {todo && <span className="ml-1 text-amber-400">·</span>}
            </button>
            {isWeb && (
              <>
                <button
                  onClick={() => (fav ? removeFavorite(fav.id) : addFavorite(svc.name, svc.url))}
                  title={fav ? "즐겨찾기 해제" : "즐겨찾기에 저장"}
                  className="border-y border-white/10 px-2 py-1.5 text-sm text-white/40 hover:bg-white/10 hover:text-amber-300"
                >
                  {fav ? "★" : "☆"}
                </button>
                <button
                  onClick={() => removeWebSlot(svc.id)}
                  title="웹슬롯 제거"
                  className="rounded-r-full border border-l-0 border-white/10 px-2 py-1.5 text-sm text-white/40 hover:bg-rose-500/20 hover:text-rose-300"
                >
                  ✕
                </button>
              </>
            )}
          </span>
        );
      })}

      {/* 즐겨찾기 중 아직 웹슬롯이 아닌 것 */}
      {favorites
        .filter((f) => !services.some((s) => s.url === f.url))
        .map((f) => (
          <button
            key={f.id}
            onClick={() => addWebSlot(f.url, f.name)}
            title={`${f.url}\n클릭하면 웹슬롯으로 추가`}
            className="shrink-0 rounded-full border border-dashed border-amber-400/30 px-3.5 py-1.5 text-sm text-amber-200/60 hover:border-amber-400/60 hover:text-amber-200"
          >
            ★ {f.name}
          </button>
        ))}

      {urlOpen ? (
        <span className="flex shrink-0 items-center gap-1">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitUrl();
              if (e.key === "Escape") setUrlOpen(false);
            }}
            placeholder="https://…"
            className="h-8 w-64 rounded border border-white/20 bg-white/5 px-2 text-sm text-white/90 outline-none"
          />
          <button onClick={submitUrl} className="rounded bg-white/15 px-2.5 py-1.5 text-sm text-white/90">
            추가
          </button>
        </span>
      ) : (
        <button
          onClick={() => setUrlOpen(true)}
          disabled={full}
          title="일반 URL을 패널로 추가 (웹슬롯)"
          className="shrink-0 rounded-full border border-dashed border-white/20 px-3.5 py-1.5 text-sm text-white/50 hover:border-white/40 hover:text-white/90 disabled:opacity-40"
        >
          + URL
        </button>
      )}

      <span className="ml-auto flex shrink-0 items-center gap-1 text-sm text-white/50">
        열
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => setColumns(n)}
            className={"h-7 w-7 rounded text-sm " + (columns === n ? "bg-white/15 text-white/90" : "hover:bg-white/10")}
          >
            {n}
          </button>
        ))}
      </span>
    </div>
  );
}
