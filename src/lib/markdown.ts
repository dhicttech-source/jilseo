import TurndownService from "turndown";

const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});
// 버튼·아이콘·숨김 요소는 본문이 아니다 (Claude의 "웹 검색됨" 칩, 복사 버튼 등)
td.remove(["button", "style", "script", "noscript"]);
td.addRule("nonContent", {
  filter: (node) =>
    node.nodeName === "svg" ||
    node.nodeName === "SVG" ||
    (node.nodeType === 1 && (node as Element).getAttribute("aria-hidden") === "true"),
  replacement: () => "",
});
// <pre><code class="language-x"> → ```x
td.addRule("fencedWithLang", {
  filter: (node) => node.nodeName === "PRE" && !!node.querySelector("code"),
  replacement: (_c, node) => {
    const code = (node as HTMLElement).querySelector("code")!;
    const lang = (code.className.match(/language-([\w-]+)/) || [])[1] ?? "";
    return `\n\n\`\`\`${lang}\n${code.textContent ?? ""}\n\`\`\`\n\n`;
  },
});

/** 응답 HTML → Markdown. 변환 실패나 빈 결과면 fallback 텍스트 */
export function htmlToMarkdown(html: string, fallback = ""): string {
  if (!html.trim()) return fallback;
  try {
    const md = td.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
    return md || fallback;
  } catch {
    return fallback;
  }
}
