import { unzipSync, strFromU8 } from "fflate";
import type { Attachment } from "../../adapters";

/**
 * 첨부 문서에서 가릴 텍스트를 꺼내고, 가린 결과로 첨부를 다시 만든다.
 * - 텍스트 계열: 본문을 그대로 가리고 같은 형식으로
 * - docx·pptx·xlsx·PDF: 텍스트를 추출해 Markdown 텍스트(.txt)로 변환 (서식·이미지 제외)
 * - 이미지·스캔 PDF·기타: 읽을 수 없음 → 원본 그대로 또는 첨부 빼기만 가능
 * 전부 로컬 처리이며 외부 호출 없음.
 */
export type AttachmentKind = "text" | "docx" | "pptx" | "xlsx" | "pdf" | "unsupported";

export interface Extracted {
  kind: AttachmentKind;
  /** 가릴 본문. 읽을 수 없으면 null */
  text: string | null;
  /** 원본 형식을 버리고 텍스트로 변환하는지 */
  converted: boolean;
  /** 읽을 수 없는 이유 또는 변환 안내 */
  note?: string;
  truncated?: boolean;
}

/** PDF 텍스트 추출기 (앱은 pdfjs, 테스트는 node용 pdfjs를 주입) */
export type PdfTextLoader = (bytes: Uint8Array, maxPages: number) => Promise<{ pages: string[]; numPages: number }>;

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "log", "xml", "html", "htm", "yaml", "yml", "ini", "conf", "sql",
  "py", "js", "ts", "tsx", "jsx", "java", "kt", "c", "h", "cpp", "go", "rs", "rb", "php", "sh", "swift", "srt", "vtt",
]);
export const MAX_PDF_PAGES = 300;
export const MAX_SHEET_ROWS = 2000;

export const splitName = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? { base: name.slice(0, i), ext: name.slice(i + 1).toLowerCase() } : { base: name, ext: "" };
};

export function attachmentKind(name: string, mime: string): AttachmentKind {
  const { ext } = splitName(name);
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (ext === "xlsx") return "xlsx";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (TEXT_EXT.has(ext) || mime.startsWith("text/") || mime === "application/json") return "text";
  return "unsupported";
}

// ---------- base64 ----------

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** UTF-8 우선, 깨지면 EUC-KR(한국어 레거시 문서) */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

// ---------- XML 공통 ----------

const decodeXml = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/g, (_, dec, hex, named) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[named],
  );

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
function markdownTable(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length));
  if (!rows.length || width === 0) return "";
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")].map(cell);
  const [head, ...rest] = rows.map(pad);
  return [`| ${head.join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...rest.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

const file = (files: Record<string, Uint8Array>, path: string) => (files[path] ? strFromU8(files[path]) : "");
const numbered = (files: Record<string, Uint8Array>, re: RegExp) =>
  Object.keys(files)
    .filter((p) => re.test(p))
    .sort((a, b) => Number(a.match(re)![1]) - Number(b.match(re)![1]));

// ---------- docx ----------

function docxParagraph(xml: string): string {
  let out = "";
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>|<w:cr\/>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) out += m[1] !== undefined ? decodeXml(m[1]) : m[0].startsWith("<w:tab") ? "\t" : "\n";
  const style = /<w:pStyle w:val="(?:Heading|heading|제목)\s?(\d)"/.exec(xml);
  if (style && out.trim()) return `${"#".repeat(Math.min(6, Number(style[1])))} ${out.trim()}`;
  if (/<w:numPr[\s>/]/.test(xml) && out.trim()) return `- ${out.trim()}`;
  return out;
}

function docxBody(xml: string): string {
  const blocks: string[] = [];
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const b = m[0];
    if (b.startsWith("<w:tbl>")) {
      const rows = (b.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []).map((tr) =>
        (tr.match(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc [\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
          (tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []).map(docxParagraph).join(" "),
        ),
      );
      blocks.push(markdownTable(rows));
    } else blocks.push(docxParagraph(b));
  }
  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function docxToText(files: Record<string, Uint8Array>): string {
  const parts = [docxBody(file(files, "word/document.xml"))];
  const extras: [RegExp, string][] = [
    [/^word\/header(\d+)\.xml$/, "머리글"],
    [/^word\/footer(\d+)\.xml$/, "바닥글"],
  ];
  for (const [re, label] of extras) for (const p of numbered(files, re)) {
    const t = docxBody(file(files, p));
    if (t) parts.push(`## ${label}\n${t}`);
  }
  for (const [p, label] of [["word/footnotes.xml", "각주"], ["word/endnotes.xml", "미주"], ["word/comments.xml", "메모"]] as const) {
    const t = docxBody(file(files, p));
    if (t) parts.push(`## ${label}\n${t}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

// ---------- pptx ----------

function drawingParagraphs(xml: string): string[] {
  return (xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p [\s\S]*?<\/a:p>/g) ?? [])
    .map((p) => (p.match(/<a:t>([^<]*)<\/a:t>|<a:t [^>]*>([^<]*)<\/a:t>/g) ?? []).map((t) => decodeXml(t.replace(/<[^>]+>/g, ""))).join(""))
    .filter((s) => s.trim());
}

export function pptxToText(files: Record<string, Uint8Array>): string {
  const out: string[] = [];
  numbered(files, /^ppt\/slides\/slide(\d+)\.xml$/).forEach((p, i) => {
    const n = p.match(/slide(\d+)\.xml$/)![1];
    const lines = drawingParagraphs(file(files, p));
    const notes = drawingParagraphs(file(files, `ppt/notesSlides/notesSlide${n}.xml`)).filter((l) => !/^\d+$/.test(l.trim()));
    out.push(`## 슬라이드 ${i + 1}\n${lines.join("\n")}${notes.length ? `\n> 노트: ${notes.join(" / ")}` : ""}`);
  });
  return out.join("\n\n");
}

// ---------- xlsx ----------

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+$/, "");
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

export function xlsxToText(files: Record<string, Uint8Array>): { text: string; truncated: boolean } {
  const shared = (file(files, "xl/sharedStrings.xml").match(/<si>[\s\S]*?<\/si>/g) ?? []).map((si) =>
    (si.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? []).map((t) => decodeXml(t.replace(/<[^>]+>/g, ""))).join(""),
  );
  const rels = new Map<string, string>();
  for (const m of file(files, "xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels.set(m[1], m[2]);
  for (const m of file(files, "xl/_rels/workbook.xml.rels").matchAll(/<Relationship [^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) rels.set(m[2], m[1]);
  const sheets = [...file(files, "xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
    name: decodeXml(m[1]),
    path: `xl/${(rels.get(m[2]) ?? "").replace(/^\/?xl\//, "")}`,
  }));
  let truncated = false;
  const out: string[] = [];
  for (const sh of sheets) {
    const xml = file(files, sh.path);
    const rows: string[][] = [];
    for (const row of xml.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? []) {
      if (rows.length >= MAX_SHEET_ROWS) {
        truncated = true;
        break;
      }
      const cells: string[] = [];
      for (const c of row.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const inner = c[2] ?? "";
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
        let val = "";
        if (type === "s" && v !== undefined) val = shared[Number(v)] ?? "";
        else if (type === "inlineStr") val = (inner.match(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g) ?? []).map((t) => decodeXml(t.replace(/<[^>]+>/g, ""))).join("");
        else if (v !== undefined) val = decodeXml(v);
        const idx = ref ? colIndex(ref) : cells.length;
        cells[idx] = val;
      }
      const filled = Array.from(cells, (x) => x ?? "");
      if (filled.some((x) => x.trim())) rows.push(filled);
    }
    if (rows.length) out.push(`## 시트: ${sh.name}\n${markdownTable(rows)}`);
  }
  return { text: out.join("\n\n"), truncated };
}

// ---------- PDF ----------

async function pdfToText(bytes: Uint8Array, loader: PdfTextLoader): Promise<Extracted> {
  const { pages, numPages } = await loader(bytes, MAX_PDF_PAGES);
  const text = pages.map((p, i) => `## 페이지 ${i + 1}\n${p.trim()}`).join("\n\n");
  const chars = pages.join("").replace(/\s/g, "").length;
  if (chars < Math.max(10, numPages * 10))
    return { kind: "pdf", text: null, converted: false, note: "텍스트가 없는 PDF(스캔본·이미지)로 보여 내용을 검사할 수 없습니다" };
  return { kind: "pdf", text, converted: true, truncated: numPages > MAX_PDF_PAGES, note: "PDF를 텍스트로 변환합니다(레이아웃·이미지 제외)" };
}

// ---------- 진입점 ----------

export async function extractAttachmentText(att: Attachment, pdfLoader?: PdfTextLoader): Promise<Extracted> {
  const kind = attachmentKind(att.name, att.mime);
  try {
    const bytes = base64ToBytes(att.data);
    if (kind === "text") return { kind, text: decodeText(bytes), converted: false };
    if (kind === "docx") return { kind, text: docxToText(unzipSync(bytes)), converted: true, note: "Word 문서를 텍스트로 변환합니다(서식·이미지 제외)" };
    if (kind === "pptx") return { kind, text: pptxToText(unzipSync(bytes)), converted: true, note: "PowerPoint를 텍스트로 변환합니다(도형 배치·이미지 제외)" };
    if (kind === "xlsx") {
      const r = xlsxToText(unzipSync(bytes));
      return { kind, text: r.text, converted: true, truncated: r.truncated, note: "Excel을 시트별 표로 변환합니다(수식·서식 제외)" };
    }
    if (kind === "pdf") {
      if (!pdfLoader) return { kind, text: null, converted: false, note: "PDF 추출기를 불러오지 못했습니다" };
      return await pdfToText(bytes, pdfLoader);
    }
  } catch (e) {
    return { kind, text: null, converted: false, note: `문서를 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { kind, text: null, converted: false, note: "이미지·기타 형식은 내용을 검사할 수 없습니다" };
}

/** 가린 본문과 파일명으로 첨부를 다시 만든다. 텍스트 계열은 형식 유지, 나머지는 .txt */
export function rebuildAttachment(att: Attachment, ex: Extracted, maskedBody: string, maskedBase: string): Attachment {
  const { ext } = splitName(att.name);
  const text = ex.converted
    ? `# 원본: ${maskedBase}.${ext} — 질서가 텍스트로 변환하고 개인정보를 가렸습니다 (서식·이미지 제외${ex.truncated ? ", 일부 생략" : ""})\n\n${maskedBody}\n`
    : maskedBody;
  const bytes = new TextEncoder().encode(text);
  const name = ex.converted ? `${maskedBase}_가림.txt` : `${maskedBase}_가림${ext ? `.${ext}` : ""}`;
  return { name, mime: ex.converted ? "text/plain" : att.mime || "text/plain", size: bytes.length, data: bytesToBase64(bytes) };
}
