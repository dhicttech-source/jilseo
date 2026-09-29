import { useRef, useState } from "react";
import { isBroadcastTarget } from "../adapters";
import { runBroadcast } from "../lib/broadcast";
import { runPipeline } from "../lib/pipeline";
import { resolvePipelineRoles } from "../lib/roles";
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
  const mode = useStage((s) => s.mode);
  const setMode = useStage((s) => s.setMode);
  const roles = useStage((s) => s.roles);
  const pipeline = mode === "pipeline";
  const resolved = resolvePipelineRoles(stage, roles, services);

  const targets = stage
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .filter(isBroadcastTarget);
  const canSend = pipeline ? !resolved.error : targets.length > 0;
  const placeholder = !targets.length
    ? "스테이지에 패널이 없습니다"
    : pipeline
      ? resolved.error
        ? `파이프라인: ${resolved.error} (패널 헤더의 역할 칩으로 지정)`
        : `${resolved.generator?.name} 생성 → ${resolved.verifiers.map((v) => v.name).join(" · ")} 검증  (⌘⏎)`
      : `${targets.map((t) => t.name).join(" · ")} 에게 동시에 보내기  (⌘⏎)`;

  const sendPipeline = async (body: string) => {
    setSummary("생성 중…");
    setText("");
    try {
      const r = await runPipeline(body, (_step, detail) => setSummary(detail));
      setSummary(
        `생성 ${services.find((x) => x.id === r.generator)?.name ?? r.generator} → 검증 ${r.verifiersSent}/${r.verifiersTotal} · ${Math.round(r.ms / 1000)}s` +
          (r.saved !== "skipped" ? ` · 비교 기록 ${r.saved === "saved" ? "저장" : "큐"}` : ""),
      );
    } catch (e) {
      setSummary(`파이프라인 실패: ${e instanceof Error ? e.message : String(e)}`);
      setText(body); // 실패하면 입력을 되돌려 다시 시도할 수 있게
    }
    setBusy(false);
    taRef.current?.focus();
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy || !canSend) return;
    setBusy(true);
    setSummary(null);
    if (pipeline) return sendPipeline(body);
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
          "h-12 shrink-0 rounded-lg border px-3.5 text-base " +
          (attachment ? "border-sky-400/50 bg-sky-400/15 text-sky-200" : "border-white/10 text-white/50 hover:bg-white/10")
        }
      >
        📎
      </button>
      <button
        onClick={() => setMode(pipeline ? "broadcast" : "pipeline")}
        disabled={busy}
        title={pipeline ? "파이프라인 모드: 생성 패널 1개에 보낸 뒤 그 답변을 검증 패널들에 보냅니다. 클릭하면 동시 전송으로" : "동시 전송 모드. 클릭하면 생성→검증 파이프라인으로"}
        className={
          "h-12 shrink-0 rounded-lg border px-3 text-sm " +
          (pipeline ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-white/50 hover:bg-white/10")
        }
      >
        {pipeline ? "생성→검증" : "동시"}
      </button>
      <button
        onClick={toggleLibrary}
        title="프롬프트 라이브러리"
        className={
          "h-12 shrink-0 rounded-lg border px-3.5 text-base " +
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
        placeholder={placeholder}
        className="min-h-12 flex-1 resize-y rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-base text-white/90 outline-none placeholder:text-white/30 focus:border-white/30"
      />
      <div className="flex flex-col items-end gap-1">
        {attachment && (
          <span className="flex items-center gap-1 rounded bg-sky-400/15 px-2 py-0.5 text-xs text-sky-200">
            📎 {attachment.name} · {(attachment.size / 1024).toFixed(0)}KB
            <button onClick={() => setAttachment(null)} className="ml-1 text-sky-200/60 hover:text-white">✕</button>
          </span>
        )}
        {summary && <span className="text-xs text-white/50">{summary}</span>}
        <button
          onClick={() => void send()}
          disabled={busy || !text.trim() || !canSend}
          className="rounded-lg bg-white/90 px-5 py-2.5 text-base font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          {busy ? (pipeline ? "진행 중…" : "전송 중…") : "▶ 보내기"}
        </button>
      </div>
    </div>
  );
}
