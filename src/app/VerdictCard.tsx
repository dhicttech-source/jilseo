import { GRADE_LABEL, type Grade, type Judged } from "../lib/lenses";
import { depthOf, findPreset, sortByLensOrder } from "../lib/presets";
import { pipelineToMarkdown } from "../lib/exportMarkdown";
import { copyText, saveExport } from "../lib/exportFile";
import { useState } from "react";
import { usePipelineResult } from "../store/pipelineResult";
import { useStage } from "../store/stage";

const GRADE_CLASS: Record<Grade, string> = {
  trust: "bg-emerald-400/20 text-emerald-200",
  revise: "bg-amber-400/20 text-amber-200",
  distrust: "bg-rose-400/20 text-rose-200",
  unknown: "bg-white/10 text-white/50",
};

const JUDGE: { key: Judged; label: string; on: string }[] = [
  { key: "right", label: "맞는 지적", on: "bg-emerald-400/30 text-emerald-100" },
  { key: "wrong", label: "틀린 지적", on: "bg-rose-400/30 text-rose-100" },
  { key: "hold", label: "보류", on: "bg-white/25 text-white/90" },
];

/**
 * 파이프라인 완료 후 전송 바 위에 뜨는 요약 카드. 판정을 원문보다 먼저 보게 하고(SCREEN의 Stop),
 * 판정마다 사람의 채택을 한 번 클릭으로 남긴다 (성적표의 원재료).
 */
export function VerdictCard() {
  const result = usePipelineResult((s) => s.result);
  const judge = usePipelineResult((s) => s.judge);
  const close = usePipelineResult((s) => s.set);
  const revise = usePipelineResult((s) => s.revise);
  const revising = usePipelineResult((s) => s.revising);
  const services = useStage((s) => s.services);
  const setMaximized = useStage((s) => s.setMaximized);
  const maximized = useStage((s) => s.maximized);
  const [note, setNote] = useState<string | null>(null);
  if (!result) return null;
  const name = (id: string) => services.find((x) => x.id === id)?.name ?? id;
  const toMarkdown = () =>
    pipelineToMarkdown({
      prompt: result.prompt,
      generatorName: name(result.generator),
      answer: result.answer,
      verifiers: result.verifiers.map((v) => ({ name: name(v.serviceId), lensName: v.lens.name, text: v.text, verdict: v.verdict, sent: v.sent })),
      revised: result.revised,
      presetName: findPreset(result.presetId ?? undefined)?.name,
      depthLabel: depthOf(result.depth).label,
      at: result.at,
      ephemeral: result.ephemeral,
    });
  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(null), 3000);
  };
  // 표시 순서: 긍정 → 사실 → 추론 → 부정 → 개선 (설계 §4). 패널 자체는 옮기지 않는다
  const ordered = sortByLensOrder(result.verifiers, (v) => v.lens.id);
  const preset = findPreset(result.presetId ?? undefined);

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
      <div className="flex items-center gap-2 text-white/60">
        <span className="font-medium text-white/85">판정 요약</span>
        <span>
          {name(result.generator)} 생성 → 검증 {result.verifiersSent}/{result.verifiersTotal} · {Math.round(result.ms / 1000)}s
          {result.saved !== "skipped" ? ` · 기록 ${result.saved === "saved" ? "저장" : "큐"}` : result.ephemeral ? " · 🔒 기록 안 함" : ""}
          {` · ${preset ? preset.name + " · " : ""}${depthOf(result.depth).label}`}
          {result.skipped.length > 0 && ` · 생략 ${result.skipped.map(name).join(", ")}`}
        </span>
        {note && <span className="text-xs text-sky-300">{note}</span>}
        <button
          onClick={() => void copyText(toMarkdown()).then((ok) => flash(ok ? "Markdown 복사됨" : "복사 실패"))}
          className="ml-auto rounded px-2 py-0.5 text-white/60 hover:bg-white/10 hover:text-white/90"
          title="질문·생성 답변·검증 판정·수정본을 Markdown으로 클립보드에 복사"
        >
          Markdown 복사
        </button>
        <button
          onClick={() => void saveExport(toMarkdown(), "pipeline", result.at).then((p) => flash(`저장: ${p.split("/").pop()}`)).catch((e) => flash(`저장 실패: ${String(e)}`))}
          className="rounded px-2 py-0.5 text-white/60 hover:bg-white/10 hover:text-white/90"
          title="앱 데이터 폴더 exports/에 .md로 저장"
        >
          저장
        </button>
        {!result.revised && result.verifiersSent > 0 && (
          <button
            onClick={() => void revise()}
            disabled={revising}
            className="rounded border border-emerald-400/40 px-2 py-0.5 text-emerald-200 hover:bg-emerald-400/15 disabled:opacity-40"
            title="검증 판정을 생성 패널의 같은 대화에 보내 지적을 반영한 수정본을 받습니다 (전송 1회)"
          >
            {revising ? "수정본 작성 중…" : "지적 반영 수정본 요청"}
          </button>
        )}
        <button
          onClick={() => setMaximized(maximized === result.generator ? null : result.generator)}
          className="rounded px-2 py-0.5 text-white/60 hover:bg-white/10 hover:text-white/90"
          title="판정을 먼저 읽고 나서 생성 답변 원문을 크게 봅니다"
        >
          {maximized === result.generator ? "원문 닫기" : "생성 원문 크게 보기"}
        </button>
        <button onClick={() => close(null)} className="rounded px-2 py-0.5 text-white/50 hover:bg-white/10 hover:text-white/90" title="닫기">
          ✕
        </button>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, ordered.length)}, minmax(0, 1fr))` }}>
        {ordered.map((v) => (
          <div key={v.serviceId} className="flex min-w-0 flex-col gap-1 rounded-lg border border-white/10 p-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white/85">{name(v.serviceId)}</span>
              <span className="text-xs text-white/50" title={v.lens.description}>
                {v.lens.icon} {v.lens.name}
              </span>
              <span className={"ml-auto rounded px-1.5 py-0.5 text-xs " + GRADE_CLASS[v.sent ? v.verdict.grade : "unknown"]}>
                {v.sent ? GRADE_LABEL[v.verdict.grade] : "전송 실패"}
              </span>
            </div>
            {v.sent && v.verdict.parsed && (
              <div className="text-xs text-white/45">
                심각 {v.verdict.counts.severe} · 보통 {v.verdict.counts.normal} · 경미 {v.verdict.counts.minor}
              </div>
            )}
            {v.verdict.headline.length > 0 ? (
              <ul className="list-disc pl-4 text-xs text-white/75">
                {v.verdict.headline.map((h, i) => (
                  <li key={i} className="truncate" title={h}>
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              v.sent && <div className="text-xs text-white/40">판정 블록 없음 · 패널에서 원문 확인</div>
            )}
            {v.sent && (
              <div className="mt-auto flex gap-1 pt-1">
                {JUDGE.map((j) => (
                  <button
                    key={j.key}
                    onClick={() => void judge(v.serviceId, j.key)}
                    className={
                      "rounded px-2 py-0.5 text-xs " +
                      (v.verdict.judged === j.key ? j.on : "bg-white/5 text-white/50 hover:bg-white/15 hover:text-white/85")
                    }
                  >
                    {j.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {(result.revised || result.reviseError) && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-emerald-200">수정본 ({name(result.generator)})</span>
            {result.reviseError && <span className="text-rose-300">{result.reviseError}</span>}
            {result.revised && <span className="text-white/40">{result.revised.length.toLocaleString()}자 · 전문은 생성 패널에서</span>}
          </div>
          {result.revised && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-white/75">{result.revised.slice(0, 600)}</p>}
        </div>
      )}
    </div>
  );
}
