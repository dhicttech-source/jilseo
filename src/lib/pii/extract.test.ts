import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Attachment } from "../../adapters";
import { applyMask, buildGroups } from "./mask";
import {
  attachmentKind,
  base64ToBytes,
  bytesToBase64,
  decodeText,
  extractAttachmentText,
  rebuildAttachment,
  type PdfTextLoader,
} from "./extract";

const att = (name: string, bytes: Uint8Array, mime = ""): Attachment => ({ name, mime, size: bytes.length, data: bytesToBase64(bytes) });
const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
const W = (body: string) => `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`;
const P = (t: string, extra = "") => `<w:p>${extra}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

describe("attachmentKind / base64 / decodeText", () => {
  it("확장자·MIME으로 형식 판별", () => {
    expect(attachmentKind("a.docx", "")).toBe("docx");
    expect(attachmentKind("a.PDF", "")).toBe("pdf");
    expect(attachmentKind("a.csv", "")).toBe("text");
    expect(attachmentKind("noext", "text/plain")).toBe("text");
    expect(attachmentKind("photo.png", "image/png")).toBe("unsupported");
    expect(attachmentKind("old.hwp", "")).toBe("unsupported");
  });
  it("base64 왕복과 한글", () => {
    const b = new TextEncoder().encode("홍길동 010-1234-5678");
    expect(decodeText(base64ToBytes(bytesToBase64(b)))).toBe("홍길동 010-1234-5678");
  });
  it("UTF-8 BOM 제거", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("A");
  });
});

describe("docx", () => {
  it("제목·목록·표·머리글·각주를 Markdown 텍스트로", async () => {
    const bytes = zip({
      "word/document.xml": W(
        P("회의록", '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>') +
          P("참석: 홍길동 과장", "<w:pPr><w:numPr/></w:pPr>") +
          `<w:tbl><w:tr><w:tc>${P("이름")}</w:tc><w:tc>${P("연락처")}</w:tc></w:tr><w:tr><w:tc>${P("김민 씨")}</w:tc><w:tc>${P("010-1234-5678")}</w:tc></w:tr></w:tbl>` +
          P("A &amp; B"),
      ),
      "word/header1.xml": W(P("(주)한빛소프트 대외비")),
      "word/footnotes.xml": W(P("출처: 이수정 연구원")),
    });
    const ex = await extractAttachmentText(att("회의록.docx", bytes));
    expect(ex.converted).toBe(true);
    expect(ex.text).toContain("# 회의록");
    expect(ex.text).toContain("- 참석: 홍길동 과장");
    expect(ex.text).toContain("| 이름 | 연락처 |\n| --- | --- |\n| 김민 씨 | 010-1234-5678 |");
    expect(ex.text).toContain("A & B");
    expect(ex.text).toContain("## 머리글\n(주)한빛소프트 대외비");
    expect(ex.text).toContain("## 각주\n출처: 이수정 연구원");
  });
  it("깨진 파일은 읽지 못함으로", async () => {
    const ex = await extractAttachmentText(att("x.docx", new Uint8Array([1, 2, 3])));
    expect(ex.text).toBeNull();
    expect(ex.note).toContain("읽지 못했습니다");
  });
});

describe("pptx / xlsx", () => {
  it("슬라이드는 번호 순서(2 < 10), 노트 포함, 슬라이드 번호 자리표시자 제외", async () => {
    const S = (t: string) => `<p:sld><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
    const bytes = zip({
      "ppt/slides/slide10.xml": S("열번째"),
      "ppt/slides/slide2.xml": S("두번째 홍길동 대표"),
      "ppt/slides/slide1.xml": S("첫번째"),
      "ppt/notesSlides/notesSlide2.xml": `<p:notes><a:p><a:r><a:t>발표자 메모 010-9876-5432</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:notes>`,
    });
    const ex = await extractAttachmentText(att("발표.pptx", bytes));
    expect(ex.text!.indexOf("첫번째")).toBeLessThan(ex.text!.indexOf("두번째"));
    expect(ex.text!.indexOf("두번째")).toBeLessThan(ex.text!.indexOf("열번째"));
    expect(ex.text).toContain("> 노트: 발표자 메모 010-9876-5432");
    expect(ex.text).not.toContain("/ 2");
  });
  it("엑셀: 공유 문자열·인라인·숫자, 시트 이름, 빈 칸 위치 유지", async () => {
    const bytes = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="고객 명단" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst><si><t>이름</t></si><si><t>전화</t></si><si><r><t>홍</t></r><r><t>길동</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>42</v></c><c r="C2" t="inlineStr"><is><t>010-1234-5678</t></is></c></row>
      </sheetData></worksheet>`,
    });
    const ex = await extractAttachmentText(att("고객.xlsx", bytes));
    expect(ex.text).toBe("## 시트: 고객 명단\n| 이름 |  | 전화 |\n| --- | --- | --- |\n| 홍길동 | 42 | 010-1234-5678 |");
  });
});

describe("pdf", () => {
  const loader = (pages: string[]): PdfTextLoader => async () => ({ pages, numPages: pages.length });
  it("텍스트가 있으면 페이지별 변환", async () => {
    const ex = await extractAttachmentText(att("계약서.pdf", new Uint8Array([37])), loader(["갑: 홍길동 대표 010-1234-5678", "을: (주)한빛소프트"]));
    expect(ex.converted).toBe(true);
    expect(ex.text).toBe("## 페이지 1\n갑: 홍길동 대표 010-1234-5678\n\n## 페이지 2\n을: (주)한빛소프트");
  });
  it("텍스트가 거의 없으면 스캔본으로 보고 읽지 못함", async () => {
    const ex = await extractAttachmentText(att("scan.pdf", new Uint8Array([37])), loader(["", " ", "1"]));
    expect(ex.text).toBeNull();
    expect(ex.note).toContain("스캔본");
  });
  it("추출기가 없으면 읽지 못함", async () => {
    expect((await extractAttachmentText(att("a.pdf", new Uint8Array([37])))).text).toBeNull();
  });
  it("실제 PDF를 pdfjs(node)로 읽는다", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const nodeLoader: PdfTextLoader = async (bytes) => {
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      }
      return { pages, numPages: doc.numPages };
    };
    const ex = await extractAttachmentText(att("t.pdf", tinyPdf("Call John Kim at 010-1234-5678 or kim@example.com")), nodeLoader);
    expect(ex.text).toContain("010-1234-5678");
    expect(ex.text).toContain("kim@example.com");
  });
});

describe("rebuildAttachment (가림 → 첨부 재구성)", () => {
  it("텍스트 계열은 형식 유지, 변환 문서는 .txt + 머리말, 파일명도 가린다", async () => {
    const csv = att("고객_홍길동.csv", new TextEncoder().encode("이름,전화\n홍길동 님,010-1234-5678\n"), "text/csv");
    const ex = await extractAttachmentText(csv);
    const sources = [
      { id: "file", label: "첨부", text: ex.text! },
      { id: "filename", label: "파일명", text: "고객_홍길동" },
    ];
    const { texts } = applyMask(sources, buildGroups(sources).groups);
    const rebuilt = rebuildAttachment(csv, ex, texts.file, texts.filename);
    expect(rebuilt.name).toBe("고객_[인물A]_가림.csv");
    expect(rebuilt.mime).toBe("text/csv");
    expect(decodeText(base64ToBytes(rebuilt.data))).toBe("이름,전화\n[인물A] 님,[전화1]\n");
    expect(rebuilt.size).toBe(base64ToBytes(rebuilt.data).length);

    const docxEx = { kind: "docx" as const, text: "본문", converted: true };
    const r2 = rebuildAttachment(att("보고서.docx", new Uint8Array([1])), docxEx, "[인물A] 본문", "보고서");
    expect(r2.name).toBe("보고서_가림.txt");
    expect(r2.mime).toBe("text/plain");
    expect(decodeText(base64ToBytes(r2.data))).toMatch(/^# 원본: 보고서\.docx — 질서가 텍스트로 변환/);
  });
});

/** 최소 PDF (Helvetica, ASCII 텍스트 한 줄) */
function tinyPdf(text: string): Uint8Array {
  const esc = text.replace(/[\\()]/g, "\\$&");
  const stream = `BT /F1 12 Tf 72 720 Td (${esc}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe("보안 검토 반영: 인코딩 우회", () => {
  it("HTML 숫자 엔티티로 쓴 이름·이메일을 풀어서 탐지한다 (구조 문자는 유지)", async () => {
    const html = "<p>&#54861;&#44600;&#46041; &#44284;&#51109; &lt;b&gt; hong&#64;example.com</p>";
    const ex = await extractAttachmentText(att("a.html", new TextEncoder().encode(html), "text/html"));
    expect(ex.text).toBe("<p>홍길동 과장 &lt;b&gt; hong@example.com</p>");
  });
  it("JSON \\u 이스케이프(서로게이트 포함)를 풀되 따옴표·역슬래시는 유지", async () => {
    const json = '{"n":"\\uD64D\\uAE38\\uB3D9 \\uACFC\\uC7A5","q":"\\u0022","e":"\\ud83d\\ude00"}';
    const ex = await extractAttachmentText(att("a.json", new TextEncoder().encode(json), "application/json"));
    expect(ex.text).toBe('{"n":"홍길동 과장","q":"\\u0022","e":"😀"}');
  });
  it("UTF-16(BOM) 파일을 올바르게 읽고, 깨진 바이너리는 읽을 수 없음으로", async () => {
    const s = "홍길동 010-1234-5678";
    const le = new Uint8Array(2 + s.length * 2);
    le[0] = 0xff; le[1] = 0xfe;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); le[2 + i * 2] = c & 0xff; le[3 + i * 2] = c >> 8; }
    expect((await extractAttachmentText(att("u16.txt", le))).text).toBe(s);
    const bin = new Uint8Array(400).map((_, i) => (i % 3 === 0 ? 0 : 0x41));
    const ex = await extractAttachmentText(att("bin.txt", bin));
    expect(ex.text).toBeNull();
    expect(ex.note).toContain("인코딩");
  });
});
