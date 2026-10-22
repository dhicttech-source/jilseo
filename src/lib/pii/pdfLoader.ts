import type { PdfTextLoader } from "./extract";

/** 앱용 PDF 텍스트 추출기. PDF를 첨부할 때만 pdfjs를 불러온다 (legacy 빌드: macOS 14 WebKit 호환) */
export const browserPdfLoader: PdfTextLoader = async (bytes, maxPages) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  const n = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let line = "";
    const lines: string[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      line += it.str;
      if (it.hasEOL) {
        lines.push(line);
        line = "";
      } else if (it.str && !it.str.endsWith(" ")) line += " ";
    }
    if (line.trim()) lines.push(line);
    pages.push(lines.join("\n"));
  }
  await doc.cleanup?.();
  return { pages, numPages: doc.numPages };
};
