import { useRef, useState } from "react";
import { isBroadcastTarget, type Attachment } from "../adapters";
import { composePrompt } from "../lib/promptVars";
import { restore } from "../lib/pii/mask";
import { browserPdfLoader } from "../lib/pii/pdfLoader";
import {
  attachmentUnreadable,
  defaultAttachmentChoice,
  finalizePayload,
  needsReview,
  passthroughMeta,
  preparePayload,
  type PiiMode,
} from "../lib/pii/prepare";
import type { SendOptions } from "../lib/broadcast";
import { PiiReview, type ReviewState } from "./PiiReview";
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
import { useSession } from "../store/session";
import { useUsage } from "../store/usage";
import { overLimit } from "../lib/usage";
import { broadcastToMarkdown } from "../lib/exportMarkdown";
import { copyText, saveExport } from "../lib/exportFile";
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
  const promptPrefix = useStage((s) => s.promptPrefix);
  const setPromptPrefix = useStage((s) => s.setPromptPrefix);
  const [prefixOpen, setPrefixOpen] = useState(false);
  const today = useUsage((s) => s.today);
  const usageLimits = useStage((s) => s.usageLimits);
  const ephemeral = useSession((s) => s.ephemeral);
  const setEphemeral = useSession((s) => s.setEphemeral);
  const lastBroadcast = useSession((s) => s.lastBroadcast);
  const piiMode = useStage((s) => s.piiMode);
  const setPiiMode = useStage((s) => s.setPiiMode);
  const piiAlways = useStage((s) => s.piiAlways);
  const piiNever = useStage((s) => s.piiNever);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [restoreExport, setRestoreExport] = useState(false);
  const pipeline = mode === "pipeline";

  const lastBroadcastMarkdown = () => {
    if (!lastBroadcast) return "";
    const md = broadcastToMarkdown({
      prompt: lastBroadcast.prompt,
      responses: Object.entries(lastBroadcast.responses).map(([id, text]) => ({ name: services.find((x) => x.id === id)?.name ?? id, text })),
      at: lastBroadcast.at,
      ephemeral: lastBroadcast.ephemeral,
    });
    // 가림 대응표가 있으면 이 기기에서만 원래 값으로 되돌린 사본
    return restoreExport && lastBroadcast.pii?.length ? restore(md, lastBroadcast.pii) : md;
  };
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
  const canSend = (pipeline ? !resolved.error : targets.length > 0) && !review;
  const limitHits = overLimit(today, usageLimits, (pipeline ? [resolved.generator, ...resolved.verifiers].filter((x): x is NonNullable<typeof x> => !!x) : targets).map((t) => t.id));
  const placeholder = !targets.length
    ? "스테이지에 패널이 없습니다"
    : pipeline
      ? resolved.error
        ? `파이프라인: ${resolved.error} (패널 헤더의 역할 칩으로 지정)`
        : `${resolved.generator?.name} 생성 → ${resolved.verifiers.map((v) => `${v.name}(${lensFor(v.id).name})`).join(" · ")} 검증  (⌘⏎)`
      : `${targets.map((t) => t.name).join(" · ")} 에게 동시에 보내기  (⌘⏎)`;

  const sendPipeline = async (body: string, att: Attachment | null, opts: SendOptions, original: string) => {
    setSummary("생성 중…");
    setText("");
    setResult(null);
    try {
      const r = await runPipeline(body, (_step, detail) => setSummary(detail), att, opts);
      setResult(r); // 요약 카드(VerdictCard)가 판정과 채택 버튼을 보여 준다
      setSummary(`검증 ${r.verifiersSent}/${r.verifiersTotal} · ${Math.round(r.ms / 1000)}s` + (r.skipped.length ? ` · 깊이 상한으로 ${r.skipped.length}개 생략` : ""));
    } catch (e) {
      setSummary(`파이프라인 실패: ${e instanceof Error ? e.message : String(e)}`);
      setText(original); // 실패하면 (가리기 전) 입력을 되돌려 다시 시도할 수 있게
    }
    setBusy(false);
    taRef.current?.focus();
  };

  /** 실제 전송 (비식별 관문 통과 후). text는 접두어까지 합쳐진 최종 텍스트 */
  const dispatch = async (body: string, att: Attachment | null, opts: SendOptions, original: string) => {
    if (useAttachment.getState().file) setAttachment(null); // 첨부는 1회 전송 후 해제 (가림본·빼기 선택 포함)
    if (pipeline) return sendPipeline(body, att, opts, original);
    const outcome = runBroadcast(body, targets, att, opts);
    if (!outcome) return setBusy(false);
    // 전송 단계 완료를 기다림 (completion은 응답 관찰까지)
    while (outcome.ms === 0 && Object.keys(outcome.sent).length === 0) await new Promise((r) => setTimeout(r, 50));
    setSummary(`${outcome.okCount}/${targets.length} 전송 · ${outcome.ms}ms`);
    setBusy(false);
    if (outcome.okCount > 0) setText("");
    taRef.current?.focus();
    const { saved } = await outcome.completion;
    setSummary((s) => `${s ?? ""} · ${saved !== "skipped" ? `비교 기록 ${saved === "saved" ? "저장" : "큐"}` : useSession.getState().ephemeral ? "기록 안 함" : "응답 수집 완료"}`);
  };

  /**
   * 전송 버튼: 비식별 관문 → 검토(필요 시) → dispatch.
   * 탐지는 전부 로컬. 검토 모드는 후보가 있거나 첨부를 읽지 못할 때만 패널을 연다.
   */
  const send = async () => {
    const original = text;
    const body = text.trim();
    if (!body || busy || !canSend) return;
    setBusy(true);
    setSummary(null);
    const composed = composePrompt(promptPrefix, body);
    if (piiMode === "off") return dispatch(composed, attachment, { composed: true }, original);
    setSummary(attachment ? "개인정보 검사 중(첨부 포함)…" : "개인정보 검사 중…");
    const prep = await preparePayload(composed, attachment, { always: piiAlways, never: piiNever }, attachment ? browserPdfLoader : undefined);
    if (!needsReview(prep)) {
      setSummary(null);
      return dispatch(composed, attachment, { composed: true, pii: { mapping: [], meta: passthroughMeta(prep) } }, original);
    }
    if (piiMode === "auto" && !attachmentUnreadable(prep)) {
      const f = finalizePayload(prep, prep.groups, "masked");
      setSummary(`${f.meta.count}개 가림`);
      return dispatch(f.text, f.attachment, { composed: true, pii: { mapping: f.mapping, meta: f.meta } }, original);
    }
    setReview({ prep, groups: prep.groups, choice: defaultAttachmentChoice(prep) });
    setSummary(null);
    setBusy(false);
  };

  const confirmReview = () => {
    if (!review) return;
    const f = finalizePayload(review.prep, review.groups, review.choice);
    setReview(null);
    setBusy(true);
    if (f.meta.count) setSummary(`${f.meta.count}개 가림`);
    void dispatch(f.text, f.attachment, { composed: true, pii: { mapping: f.mapping, meta: f.meta } }, text);
  };
  const sendOriginalFromReview = () => {
    if (!review) return;
    const p = review.prep;
    setReview(null);
    setBusy(true);
    void dispatch(p.prompt, p.attachment, { composed: true, pii: { mapping: [], meta: passthroughMeta(p) } }, text);
  };
  const selectedText = () => {
    const ta = taRef.current;
    return ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "";
  };
  const PII_MODE_LABEL: Record<PiiMode, string> = { off: "비식별화 끔", review: "비식별화 검토", auto: "비식별화 자동" };
  const nextPiiMode: Record<PiiMode, PiiMode> = { review: "auto", auto: "off", off: "review" };

  return (
    <div className="flex shrink-0 flex-col border-t border-white/10">
      {review && (
        <PiiReview
          state={review}
          onChange={setReview}
          onConfirm={confirmReview}
          onSendOriginal={sendOriginalFromReview}
          onCancel={() => setReview(null)}
          getSelectedText={selectedText}
        />
      )}
      {(prefixOpen || promptPrefix.trim()) && (
        <div className="flex items-start gap-2 px-3 pt-2 text-xs">
          <span className="mt-1.5 shrink-0 text-white/50" title="동시 전송과 파이프라인 생성 단계의 프롬프트 앞에 붙습니다. 검증·수정 프롬프트에는 붙지 않고, 워크스테이션에 저장됩니다">접두어</span>
          <textarea
            value={promptPrefix}
            onChange={(e) => setPromptPrefix(e.target.value)}
            rows={2}
            placeholder="예: 답변은 한국어로, 근거가 되는 출처를 끝에 적어 주세요."
            className="min-h-8 flex-1 resize-y rounded border border-white/10 bg-white/5 px-2 py-1 text-white/80 outline-none placeholder:text-white/25 focus:border-white/30"
          />
          <button onClick={() => { setPromptPrefix(""); setPrefixOpen(false); }} className="mt-1 rounded px-1.5 text-white/40 hover:bg-white/10" title="접두어 지우기">
            ✕
          </button>
        </div>
      )}
      {limitHits.length > 0 && (
        <div className="px-3 pt-2 text-xs text-rose-300">
          오늘 전송 한도 도달: {limitHits.map((h) => `${services.find((x) => x.id === h.id)?.name ?? h.id} ${h.count}/${h.limit}`).join(" · ")} — 무료 플랜이면 응답이 비거나 막힐 수 있습니다
        </div>
      )}
    <div className="flex shrink-0 items-end gap-2 px-3 py-2">
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
        onClick={() => setEphemeral(!ephemeral)}
        disabled={busy}
        title={ephemeral ? "임시 전송 켜짐: 이번 세션의 전송은 비교 기록·판정을 클라우드에 저장하지 않습니다. 클릭하면 끔" : "임시 전송: 켜면 비교 기록을 저장하지 않습니다 (민감한 프롬프트용). 앱을 다시 열면 꺼집니다"}
        className={
          "h-12 shrink-0 rounded-lg border px-3 text-base " +
          (ephemeral ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-white/10 text-white/50 hover:bg-white/10")
        }
      >
        {ephemeral ? "🔒" : "🔓"}
      </button>
      <button
        onClick={() => setPiiMode(nextPiiMode[piiMode])}
        disabled={busy || !!review}
        title={
          piiMode === "off"
            ? "비식별화 꺼짐: 프롬프트·첨부를 검사하지 않고 보냅니다. 클릭하면 검토 모드"
            : piiMode === "review"
              ? "비식별화 검토: 보내기 전에 개인정보·기관명을 찾아 보여 주고 가릴지 정합니다. 클릭하면 자동 모드"
              : "비식별화 자동: 찾은 항목을 모두 가리고 보냅니다(첨부를 못 읽으면 물어봄). 클릭하면 끔"
        }
        className={
          "h-12 shrink-0 rounded-lg border px-2.5 text-xs " +
          (piiMode === "off" ? "border-white/10 text-white/40 hover:bg-white/10" : piiMode === "auto" ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-amber-400/30 text-amber-200/80 hover:bg-amber-400/10")
        }
      >
        {PII_MODE_LABEL[piiMode]}
      </button>
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
        onClick={() => setPrefixOpen((v) => !v)}
        title="프롬프트 접두어 (워크스테이션별로 저장)"
        className={
          "h-12 shrink-0 rounded-lg border px-3 text-sm " +
          (promptPrefix.trim() ? "border-violet-400/50 bg-violet-400/15 text-violet-200" : prefixOpen ? "border-white/30 bg-white/15 text-white/90" : "border-white/10 text-white/50 hover:bg-white/10")
        }
      >
        접두어
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
        readOnly={!!review}
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
        {!pipeline && lastBroadcast && !busy && (
          <span className="flex gap-1">
            <button
              onClick={() => void copyText(lastBroadcastMarkdown()).then((ok) => setSummary(ok ? "Markdown 복사됨" : "복사 실패"))}
              className="rounded border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
              title="마지막 동시 전송 결과(질문·서비스별 응답)를 Markdown으로 클립보드에 복사"
            >
              Markdown 복사
            </button>
            <button
              onClick={() => void saveExport(lastBroadcastMarkdown(), "broadcast", lastBroadcast.at).then((p) => setSummary(`저장: ${p.split("/").pop()}`)).catch((e) => setSummary(`저장 실패: ${String(e)}`))}
              className="rounded border border-white/15 px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
              title="앱 데이터 폴더 exports/에 .md로 저장"
            >
              저장
            </button>
            {!!lastBroadcast.pii?.length && (
              <label className="flex items-center gap-1 text-xs text-white/50" title="가렸던 값을 이 기기에서만 원래대로 되돌려 복사·저장합니다">
                <input type="checkbox" checked={restoreExport} onChange={(e) => setRestoreExport(e.target.checked)} />
                원문 복원
              </label>
            )}
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
    </div>
  );
}
