import { useRef, useState } from "react";
import { ServiceAdapter, broadcastText } from "../adapters";
import { useStage } from "../store/stage";

export function BroadcastBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const services = useStage((s) => s.services);
  const stage = useStage((s) => s.stage);
  const setStatus = useStage((s) => s.setStatus);

  const targets = stage
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || targets.length === 0) return;
    setBusy(true);
    setSummary(null);
    const adapters = targets.map((d) => new ServiceAdapter(d));
    const t0 = performance.now();
    const results = await broadcastText(body, adapters, (id, phase, detail) => setStatus(id, phase, detail));
    const ms = Math.round(performance.now() - t0);
    const ok = Object.values(results).filter((r) => r.ok).length;
    setSummary(`${ok}/${adapters.length} 전송 · ${ms}ms`);
    setBusy(false);
    if (ok > 0) setText("");
    // 전송된 패널은 응답 관찰 (완료 배지용). 실패 격리: 각 패널 독립.
    for (const a of adapters) {
      if (!results[a.id]?.ok) continue;
      setStatus(a.id, "responding");
      a.observeResponse((_t, done) => {
        if (done) setStatus(a.id, "done");
      }).catch(() => {});
    }
    taRef.current?.focus();
  };

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-white/10 px-3 py-2">
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void send();
          }
        }}
        rows={2}
        placeholder={
          targets.length
            ? `${targets.map((t) => t.name).join(" · ")} 에게 동시에 보내기  (⌘⏎)`
            : "스테이지에 패널이 없습니다"
        }
        className="min-h-[44px] flex-1 resize-y rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-white/30"
      />
      <div className="flex flex-col items-end gap-1">
        {summary && <span className="text-[11px] text-white/40">{summary}</span>}
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim() || targets.length === 0}
          className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busy ? "전송 중…" : "▶ 보내기"}
        </button>
      </div>
    </div>
  );
}
