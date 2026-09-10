import { useRef, useState } from "react";
import { runBroadcast } from "../lib/broadcast";
import { useDraft } from "../store/draft";
import { useLibrary } from "../store/library";
import { useStage } from "../store/stage";

export function BroadcastBar() {
  const text = useDraft((s) => s.text);
  const setText = useDraft((s) => s.set);
  const libraryOpen = useLibrary((s) => s.open);
  const toggleLibrary = useLibrary((s) => s.toggle);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const services = useStage((s) => s.services);
  const stage = useStage((s) => s.stage);

  const targets = stage
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || targets.length === 0) return;
    setBusy(true);
    setSummary(null);
    const outcome = runBroadcast(body, targets);
    if (!outcome) return setBusy(false);
    // 전송 단계 완료를 기다림 (completion은 응답 관찰까지)
    while (outcome.ms === 0 && Object.keys(outcome.sent).length === 0) await new Promise((r) => setTimeout(r, 50));
    setSummary(`${outcome.okCount}/${targets.length} 전송 · ${outcome.ms}ms`);
    setBusy(false);
    if (outcome.okCount > 0) setText("");
    taRef.current?.focus();
    const { saved } = await outcome.completion;
    if (saved !== "skipped") setSummary((s) => `${s ?? ""} · 비교 기록 ${saved === "saved" ? "저장" : "큐"}`);
  };

  return (
    <div className="flex shrink-0 items-end gap-2 border-t border-white/10 px-3 py-2">
      <button
        onClick={toggleLibrary}
        title="프롬프트 라이브러리"
        className={
          "h-[44px] shrink-0 rounded-lg border px-3 text-sm " +
          (libraryOpen ? "border-white/30 bg-white/15 text-white/90" : "border-white/10 text-white/50 hover:bg-white/10")
        }
      >
        📚
      </button>
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
