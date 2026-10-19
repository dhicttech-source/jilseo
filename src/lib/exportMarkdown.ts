import { GRADE_LABEL, type Verdict } from "./lenses";

/** 비교 기록을 Markdown으로. 요약 카드·전송 바의 "Markdown 복사/저장"이 쓴다 (기록 자산화의 첫 단계). */

const H = (level: number, text: string) => `${"#".repeat(level)} ${text}`;
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** 파일명용 시각: 2026-10-19_1432 */
export const exportStamp = (ms = Date.now()) => fmtDate(ms).replace(" ", "_").replace(":", "");

export interface ExportVerifier {
  name: string;
  lensName: string;
  text: string;
  verdict?: Verdict;
  sent: boolean;
}

export interface PipelineExport {
  prompt: string;
  generatorName: string;
  answer: string;
  verifiers: ExportVerifier[];
  revised?: string;
  presetName?: string;
  depthLabel?: string;
  at: number;
  ephemeral?: boolean;
}

const JUDGED_LABEL = { right: "맞는 지적", wrong: "틀린 지적", hold: "보류" } as const;

export function pipelineToMarkdown(e: PipelineExport): string {
  const lines: string[] = [];
  lines.push(H(1, "질서 비교 기록 (생성 → 검증)"));
  const meta = [fmtDate(e.at), e.presetName && `프리셋 ${e.presetName}`, e.depthLabel && `깊이 ${e.depthLabel}`, e.ephemeral && "기록 안 함(임시 전송)"]
    .filter(Boolean)
    .join(" · ");
  lines.push(meta, "");
  lines.push(H(2, "질문"), "", e.prompt.trim(), "");
  lines.push(H(2, `생성 — ${e.generatorName}`), "", e.answer.trim() || "(응답 없음)", "");
  for (const v of e.verifiers) {
    lines.push(H(2, `검증 — ${v.name} · ${v.lensName} 렌즈`), "");
    if (!v.sent) {
      lines.push("(전송 실패)", "");
      continue;
    }
    if (v.verdict) {
      const c = v.verdict.counts;
      const judged = v.verdict.judged ? ` · 채택: ${JUDGED_LABEL[v.verdict.judged]}` : "";
      lines.push(`> 등급 **${GRADE_LABEL[v.verdict.grade]}** · 지적 심각 ${c.severe} / 보통 ${c.normal} / 경미 ${c.minor}${judged}`);
      for (const h of v.verdict.headline) lines.push(`> - ${h}`);
      lines.push("");
    }
    lines.push(v.text.trim() || "(응답 없음)", "");
  }
  if (e.revised?.trim()) lines.push(H(2, `수정본 — ${e.generatorName}`), "", e.revised.trim(), "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export interface BroadcastExport {
  prompt: string;
  /** 서비스 표시 이름 → 응답 */
  responses: { name: string; text: string }[];
  at: number;
  ephemeral?: boolean;
}

export function broadcastToMarkdown(e: BroadcastExport): string {
  const lines: string[] = [H(1, "질서 비교 기록 (동시 전송)"), [fmtDate(e.at), e.ephemeral && "기록 안 함(임시 전송)"].filter(Boolean).join(" · "), ""];
  lines.push(H(2, "질문"), "", e.prompt.trim(), "");
  for (const r of e.responses) lines.push(H(2, r.name), "", r.text.trim() || "(응답 없음)", "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
