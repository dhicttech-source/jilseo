import type { Attachment } from "../../adapters";
import type { DetectOptions } from "./detect";
import { extractAttachmentText, rebuildAttachment, splitName, type Extracted, type PdfTextLoader } from "./extract";
import { applyMask, buildGroups, maskSummary, type MaskEntry, type MaskSource, type PiiGroup } from "./mask";
import type { PiiKind } from "./patterns";

/**
 * 전송 직전 관문: 프롬프트(+접두어)와 첨부를 탐지 → 사용자 결정 → 가린 텍스트·첨부로 확정.
 * 검토 패널(UI)과 개발 하네스가 같은 함수를 쓴다.
 */
export type PiiMode = "off" | "review" | "auto";
export type AttachmentChoice = "masked" | "original" | "remove";

export interface PreparedSend {
  prompt: string;
  attachment: Attachment | null;
  extracted: Extracted | null;
  sources: MaskSource[];
  groups: PiiGroup[];
}

export interface PiiMeta {
  count: number;
  kinds: PiiKind[];
  attachment: "none" | "masked" | "converted" | "original" | "removed";
}

export interface FinalPayload {
  text: string;
  attachment: Attachment | null;
  mapping: MaskEntry[];
  meta: PiiMeta;
}

export const SOURCE_LABEL: Record<string, string> = { prompt: "프롬프트", file: "첨부", filename: "파일명" };

export async function preparePayload(
  prompt: string,
  attachment: Attachment | null,
  opts: DetectOptions,
  pdfLoader?: PdfTextLoader,
): Promise<PreparedSend> {
  const sources: MaskSource[] = [{ id: "prompt", label: SOURCE_LABEL.prompt, text: prompt }];
  let extracted: Extracted | null = null;
  if (attachment) {
    extracted = await extractAttachmentText(attachment, pdfLoader);
    if (extracted.text !== null) sources.push({ id: "file", label: SOURCE_LABEL.file, text: extracted.text });
    sources.push({ id: "filename", label: SOURCE_LABEL.filename, text: splitName(attachment.name).base });
  }
  return { prompt, attachment, extracted, sources, groups: buildGroups(sources, opts).groups };
}

/** 첨부를 읽지 못했으면 가릴 수 없으므로 반드시 사용자에게 묻는다 */
export const attachmentUnreadable = (p: PreparedSend) => !!p.attachment && p.extracted?.text == null;
/**
 * 변환 문서(docx·pptx·xlsx·PDF)는 원본에 검사하지 않은 부분(작성자 메타데이터·이미지·텍스트 상자 등)이 남으므로,
 * 탐지 결과가 없어도 원본을 그대로 통과시키지 않는다 — 검토 모드는 패널을 열고, 자동 모드는 변환본을 보낸다.
 * 일부 생략(truncated)된 경우도 마찬가지.
 */
export const attachmentHasUncheckedParts = (p: PreparedSend) => !!p.attachment && !!p.extracted && (p.extracted.converted || !!p.extracted.truncated);
export const needsReview = (p: PreparedSend) => p.groups.length > 0 || attachmentUnreadable(p) || attachmentHasUncheckedParts(p);
export const defaultAttachmentChoice = (p: PreparedSend): AttachmentChoice => (attachmentUnreadable(p) ? "remove" : "masked");

export function finalizePayload(p: PreparedSend, groups: PiiGroup[], choice: AttachmentChoice): FinalPayload {
  const { texts, mapping } = applyMask(p.sources, groups);
  let attachment: Attachment | null = null;
  let att: PiiMeta["attachment"] = "none";
  if (p.attachment) {
    if (choice === "remove") att = "removed";
    else if (choice === "original" || p.extracted?.text == null) {
      attachment = p.attachment;
      att = "original";
    } else {
      attachment = rebuildAttachment(p.attachment, p.extracted!, texts.file ?? "", texts.filename ?? splitName(p.attachment.name).base);
      att = p.extracted!.converted ? "converted" : "masked";
    }
  }
  // 원본 첨부를 보내면 그 안의 원문은 그대로 나가므로, 대응표에는 프롬프트에서 실제로 가린 것만 의미가 있다
  return { text: texts.prompt, attachment, mapping, meta: { ...maskSummary(mapping), attachment: att } };
}

/** 가리지 않고 보낼 때의 메타 */
export const passthroughMeta = (p: PreparedSend): PiiMeta => ({ count: 0, kinds: [], attachment: p.attachment ? "original" : "none" });
