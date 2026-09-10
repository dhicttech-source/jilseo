import { useRef, useState } from "react";
import { isBroadcastTarget } from "../adapters";
import { runBroadcast } from "../lib/broadcast";
import { MAX_ATTACHMENT_BYTES, useAttachment } from "../store/attachment";
import { useDraft } from "../store/draft";
import { useLibrary } from "../store/library";
import { useStage } from "../store/stage";

export function BroadcastBar() {
  const text = useDraft((s) => s.text);
  const setText = useDraft((s) => s.set);
  const libraryOpen = useLibrary((s) => s.open);
  const toggleLibrary = useLibrary((s) => s.toggle);
  const attachment = useAttachment((s) => s.file);
  const setAttachment = useAttachment((s) => s.set);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) return setSummary("첨부는 8MB 이하만 가능합니다");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setAttachment({ name: f.name, mime: f.type || "application/octet-stream", size: f.size, data: dataUrl.split(",")[1] ?? "" });
    };
    reader.readAsDataURL(f);
  };
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const services = useStage((s) => s.services);
  const stage = useStage((s) => s.stage);

  const targets = stage
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .filter(isBroadcastTarget);

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
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        title="파일 1개를 모든 패널에 동시 첨부 (8MB 이하)"
        className={
          "h-[44px] shrink-0 rounded-lg border px-3 text-sm " +
          (attachment ? "border-sky-400/50 bg-sky-400/15 text-sky-200" : "border-white/10 text-white/50 hover:bg-white/10")
        }
      >
        📎
      </button>
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
        {attachment && (
          <span className="flex items-center gap-1 rounded bg-sky-400/15 px-2 py-0.5 text-[11px] text-sky-200">
            📎 {attachment.name} · {(attachment.size / 1024).toFixed(0)}KB
            <button onClick={() => setAttachment(null)} className="ml-1 text-sky-200/60 hover:text-white">✕</button>
          </span>
        )}
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
