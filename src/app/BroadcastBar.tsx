import { useRef, useState } from "react";
import { isBroadcastTarget } from "../adapters";
import { runBroadcast } from "../lib/broadcast";
import { lensFor, runPipeline } from "../lib/pipeline";
import { BUILTIN_PRESETS, DEPTHS, findPreset } from "../lib/presets";
import { BUILTIN_LENSES } from "../lib/lenses";
import { recommend } from "../lib/scorecard";
import { resolvePipelineRoles } from "../lib/roles";
import { MAX_ATTACHMENT_BYTES, useAttachment } from "../store/attachment";
import { useDraft } from "../store/draft";
import { useLibrary } from "../store/library";
import { usePipelineResult } from "../store/pipelineResult";
import { useScorecard } from "../store/scorecard";
import { useStage } from "../store/stage";

const lensLabel = (id: string) => BUILTIN_LENSES.find((l) => l.id === id)?.name ?? id;

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
  const lensAssign = useStage((s) => s.lensAssign);
  const depth = useStage((s) => s.depth);
  const setDepth = useStage((s) => s.setDepth);
  const presetId = useStage((s) => s.presetId);
  const applyPresetToStage = useStage((s) => s.applyPresetToStage);
  const setRole = useStage((s) => s.setRole);
  const setLens = useStage((s) => s.setLens);
  const card = useScorecard((s) => s.card);
  const setResult = usePipelineResult((s) => s.set);
  const pipeline = mode === "pipeline";
  const resolved = resolvePipelineRoles(stage, roles, services);
  void lensAssign; // 렌즈 배정이 바뀌면 placeholder를 다시 그린다

  // 성적표 기반 배정 제안: 현재 프리셋의 슬롯마다 채택 3건 이상 중 최고 정확도 모델. 제안일 뿐 클릭해야 반영
  const preset = findPreset(presetId ?? undefined);
  const suggestions =
    pipeline && card && preset
      ? recommend(card, preset, stage.filter((id) => id !== resolved.generator?.id && services.some((s) => s.id === id && isBroadcastTarget(s))))
      : [];
  const actionable = suggestions.filter((r) => r.model && (resolved.verifiers.find((v) => v.id === r.model) ? lensAssign[r.model] !== r.lens : true));
  const applySuggestions = () => {
    for (const r of actionable) {
      if (!r.model) continue;
      setRole(r.model, "verify");
      setLens(r.model, r.lens);
    }
    setSummary(`추천 반영: ${actionable.map((r) => `${services.find((x) => x.id === r.model)?.name ?? r.model}(${lensFor(r.model!).name})`).join(" · ")}`);
  };

  const applyPreset = (id: string) => {
    if (!id) return;
    const app = applyPresetToStage(id);
    if (!app) return;
    const name = (sid: string) => services.find((x) => x.id === sid)?.name ?? sid;
    const parts = app.assigned.map((sid) => `${name(sid)}(${lensFor(sid).name})`);
    setSummary(
      `프리셋 적용: ${app.generator ? name(app.generator) : "?"} 생성 → ${parts.join(" · ") || "검증 없음"}` +
        (app.leftover.length ? ` · 제외 ${app.leftover.map(name).join(", ")}` : ""),
    );
  };

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
        : `${resolved.generator?.name} 생성 → ${resolved.verifiers.map((v) => `${v.name}(${lensFor(v.id).name})`).join(" · ")} 검증  (⌘⏎)`
      : `${targets.map((t) => t.name).join(" · ")} 에게 동시에 보내기  (⌘⏎)`;

  const sendPipeline = async (body: string) => {
    setSummary("생성 중…");
    setText("");
    setResult(null);
    try {
      const r = await runPipeline(body, (_step, detail) => setSummary(detail));
      setResult(r); // 요약 카드(VerdictCard)가 판정과 채택 버튼을 보여 준다
      setSummary(`검증 ${r.verifiersSent}/${r.verifiersTotal} · ${Math.round(r.ms / 1000)}s` + (r.skipped.length ? ` · 깊이 상한으로 ${r.skipped.length}개 생략` : ""));
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
      {pipeline && (
        <div className="flex h-12 shrink-0 flex-col justify-center gap-1">
          <select
            value={presetId ?? ""}
            onChange={(e) => applyPreset(e.target.value)}
            disabled={busy}
            title="검토 프리셋: 역할·렌즈를 한 번에 배정합니다 (생성 패널은 유지)"
            className="h-5 max-w-40 rounded border border-white/15 bg-white/5 px-1 text-xs text-white/80 outline-none"
          >
            <option value="" className="bg-[#1a1d24]">프리셋…</option>
            {BUILTIN_PRESETS.map((p) => (
              <option key={p.id} value={p.id} className="bg-[#1a1d24]" title={p.description}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="flex gap-0.5" title="깊이: 검증 패널 수와 판정 길이 (빠름 1개·5줄 / 표준 3개·15줄 / 심층 전부)">
            {DEPTHS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDepth(d.id)}
                disabled={busy}
                className={"rounded px-1.5 text-xs " + (depth === d.id ? "bg-white/20 text-white/90" : "text-white/40 hover:bg-white/10")}
              >
                {d.label}
              </button>
            ))}
          </span>
        </div>
      )}
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
        {actionable.length > 0 && (
          <button
            onClick={applySuggestions}
            disabled={busy}
            className="rounded border border-sky-400/40 px-2 py-0.5 text-xs text-sky-200 hover:bg-sky-400/15 disabled:opacity-40"
            title={suggestions
              .map((r) => `${lensLabel(r.lens)}: ${r.model ? `${services.find((x) => x.id === r.model)?.name ?? r.model} ${Math.round((r.accuracy ?? 0) * 100)}% (${r.judged}건)` : "기록 부족"}`)
              .join("\n")}
          >
            성적표 추천 반영: {actionable.map((r) => `${services.find((x) => x.id === r.model)?.name ?? r.model}→${lensLabel(r.lens)}`).join(" · ")}
          </button>
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
