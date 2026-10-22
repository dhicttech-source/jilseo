import { describe, expect, it } from "vitest";
import { addManualGroup, applyMask, buildGroups, makeToken, maskSummary, restore, type MaskSource } from "./mask";

const src = (id: string, text: string): MaskSource => ({ id, label: id, text });

describe("buildGroups", () => {
  it("같은 원문은 출처를 넘어 한 묶음, 종류별 순서대로 기호", () => {
    const { groups } = buildGroups([
      src("prompt", "홍길동 과장과 김민 씨에게 010-1234-5678로 연락"),
      src("file", "회의록: 홍길동 님 발언. 연락처 010 1234 5678"),
    ]);
    const hong = groups.find((g) => g.original === "홍길동")!;
    expect(hong.token).toBe("[인물A]");
    expect(hong.counts).toEqual({ prompt: 1, file: 1 });
    expect(groups.find((g) => g.original === "김민")!.token).toBe("[인물B]");
    const phone = groups.filter((g) => g.kind === "phone");
    expect(phone).toHaveLength(1); // 구분자만 다른 같은 번호
    expect(phone[0].token).toBe("[전화1]");
    expect(groups.every((g) => g.checked)).toBe(true);
  });
  it("기호 형식: 이름·기관은 A, B, …, AA / 나머지는 숫자", () => {
    expect(makeToken("person", 0)).toBe("[인물A]");
    expect(makeToken("org", 26)).toBe("[기관AA]");
    expect(makeToken("email", 2)).toBe("[이메일3]");
  });
});

describe("applyMask", () => {
  it("탐지 위치가 아닌 곳의 같은 원문도 모두 바꾸고, 첨부·파일명까지 같은 기호", () => {
    const sources = [src("prompt", "홍길동 과장 보고서 검토"), src("file", "작성: 홍길동\n결재: 홍길동이 확인"), src("filename", "홍길동_보고서")];
    const { groups } = buildGroups(sources);
    const { texts, mapping } = applyMask(sources, groups);
    expect(texts.prompt).toBe("[인물A] 과장 보고서 검토");
    expect(texts.file).toBe("작성: [인물A]\n결재: [인물A]이 확인");
    expect(texts.filename).toBe("[인물A]_보고서");
    expect(mapping).toEqual([{ token: "[인물A]", original: "홍길동", kind: "person" }]);
  });
  it("짧은 이름은 다른 단어 안을 건드리지 않는다", () => {
    const sources = [src("p", "김민 씨가 김민지와 김민수에게 말함. 김민은 결석")];
    const { texts } = applyMask(sources, buildGroups(sources).groups);
    expect(texts.p).toBe("[인물A] 씨가 김민지와 김민수에게 말함. [인물A]은 결석");
  });
  it("체크 해제한 묶음은 그대로, 긴 원문부터 바꿔 부분 겹침 방지", () => {
    const sources = [src("p", "한빛상사 주식회사와 한빛상사 직원 박서준 대리")];
    const { groups } = buildGroups(sources, { always: ["한빛상사"] });
    const off = groups.map((g) => (g.kind === "person" ? { ...g, checked: false } : g));
    const { texts } = applyMask(sources, off);
    expect(texts.p).toContain("박서준 대리");
    expect(texts.p).not.toContain("한빛상사");
  });
  it("번호는 구분자가 달라도 같은 번호면 바꾼다", () => {
    const sources = [src("p", "연락처 010-1234-5678"), src("f", "전화: 01012345678 / 010.1234.5678")];
    const { texts } = applyMask(sources, buildGroups(sources).groups);
    expect(texts.f).toBe("전화: [전화1] / [전화1]");
  });
  it("법인 표기로 탐지한 기관은 표기 없이 쓴 이름도 같은 기호로", () => {
    const sources = [src("p", "(주)한빛소프트 박서준 대리와 미팅, 한빛소프트에 견적 송부. Acme Corp. 및 Acme 담당")];
    const { texts } = applyMask(sources, buildGroups(sources).groups);
    expect(texts.p).toBe("[기관A] [인물A] 대리와 미팅, [기관A]에 견적 송부. [기관B] 및 [기관B] 담당");
  });
  it("직함 뒤 일반 명사(연락처 등)는 이름으로 보지 않는다", () => {
    const { groups } = buildGroups([src("p", "박서준 대리 연락처 010-2345-6789, 담당자 보고서 제출")]);
    expect(groups.map((g) => g.original)).toEqual(["박서준", "010-2345-6789"]);
  });
  it("$ 특수문자 안전", () => {
    const sources = [src("p", "가격 $10 홍길동 과장")];
    expect(applyMask(sources, buildGroups(sources).groups).texts.p).toBe("가격 $10 [인물A] 과장");
  });
});

describe("addManualGroup / restore / maskSummary", () => {
  it("직접 추가한 단어는 custom 기호, 이미 있으면 체크만", () => {
    const sources = [src("p", "프로젝트 오로라 일정, 오로라 예산")];
    let groups = addManualGroup([], sources, "오로라");
    expect(groups[0]).toMatchObject({ kind: "custom", token: "[가림1]", counts: { p: 2 } });
    groups = addManualGroup(groups.map((g) => ({ ...g, checked: false })), sources, "오로라");
    expect(groups).toHaveLength(1);
    expect(groups[0].checked).toBe(true);
    expect(addManualGroup(groups, sources, "x")).toBe(groups); // 1글자는 무시
  });
  it("복원은 모델이 띄어 쓴 기호도 맞춘다", () => {
    const mapping = [
      { token: "[인물A]", original: "홍길동", kind: "person" as const },
      { token: "[전화1]", original: "010-1234-5678", kind: "phone" as const },
    ];
    expect(restore("[인물 A]님은 [ 전화1 ]로 연락. [인물A] 확인", mapping)).toBe("홍길동님은 010-1234-5678로 연락. 홍길동 확인");
  });
  it("Markdown 이스케이프된 기호(\\[인물A\\])와 두 글자 접미어도 정확히 복원", () => {
    const mapping = [
      { token: "[인물A]", original: "홍길동", kind: "person" as const },
      { token: "[인물AA]", original: "김민", kind: "person" as const },
      { token: "[전화1]", original: "010-1234-5678", kind: "phone" as const },
      { token: "[전화12]", original: "02-123-4567", kind: "phone" as const },
    ];
    expect(restore("\\[인물A\\] 과장과 \\[인물AA\\], 연락 \\[전화1\\] / [전화12]", mapping)).toBe("홍길동 과장과 김민, 연락 010-1234-5678 / 02-123-4567");
  });
  it("요약은 개수와 종류만 (원문 없음)", () => {
    expect(maskSummary([{ token: "[인물A]", original: "x", kind: "person" }, { token: "[인물B]", original: "y", kind: "person" }])).toEqual({ count: 2, kinds: ["person"] });
  });
});

import { finalizePayload, needsReview, preparePayload } from "./prepare";
import { bytesToBase64 } from "./extract";

describe("preparePayload / finalizePayload", () => {
  const txt = (name: string, s: string) => {
    const b = new TextEncoder().encode(s);
    return { name, mime: "text/plain", size: b.length, data: bytesToBase64(b) };
  };
  it("프롬프트와 첨부·파일명을 한 대응표로 가리고 첨부를 다시 만든다", async () => {
    const p = await preparePayload("홍길동 과장 보고서를 요약해 줘", txt("홍길동_메모.txt", "작성 홍길동, 연락 010-1234-5678"), {});
    expect(needsReview(p)).toBe(true);
    const f = finalizePayload(p, p.groups, "masked");
    expect(f.text).toBe("[인물A] 과장 보고서를 요약해 줘");
    expect(f.attachment!.name).toBe("[인물A]_메모_가림.txt");
    expect(f.meta).toEqual({ count: 2, kinds: ["person", "phone"], attachment: "masked" });
  });
  it("첨부 빼기·원본 그대로", async () => {
    const p = await preparePayload("질문", txt("a.txt", "김민 씨"), {});
    expect(finalizePayload(p, p.groups, "remove").attachment).toBeNull();
    expect(finalizePayload(p, p.groups, "original").attachment!.name).toBe("a.txt");
  });
  it("읽을 수 없는 첨부(이미지)는 탐지가 없어도 검토 필요", async () => {
    const img = { name: "x.png", mime: "image/png", size: 3, data: bytesToBase64(new Uint8Array([1, 2, 3])) };
    const p = await preparePayload("그림 설명", img, {});
    expect(p.groups).toHaveLength(0);
    expect(needsReview(p)).toBe(true);
  });
  it("탐지도 첨부도 없으면 검토 불필요", async () => {
    expect(needsReview(await preparePayload("날씨 알려줘", null, {}))).toBe(false);
  });
});

describe("보안 검토 반영", () => {
  it("철자 대소문자만 다른 등장도 모두 가린다 (탐지와 치환 일치)", () => {
    const sources = [src("p", "Project Aurora, aurora 일정, AURORA 예산")];
    const { texts } = applyMask(sources, buildGroups(sources, { always: ["Aurora"] }).groups);
    expect(texts.p).toBe("Project [가림1], [가림1] 일정, [가림1] 예산");
  });
  it("변환 문서는 탐지가 없어도 검토 대상 (원본 통과 금지)", async () => {
    const { zipSync, strToU8 } = await import("fflate");
    const docx = zipSync({ "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>날씨 보고</w:t></w:r></w:p></w:body></w:document>") });
    const att = { name: "a.docx", mime: "", size: docx.length, data: bytesToBase64(docx) };
    const p = await preparePayload("요약해 줘", att, {});
    expect(p.groups).toHaveLength(0);
    expect(needsReview(p)).toBe(true);
    expect(finalizePayload(p, p.groups, "masked").attachment!.name).toBe("a_가림.txt");
  });
});
