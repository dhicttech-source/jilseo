import { describe, expect, it } from "vitest";
import { detectPii } from "./detect";
import { biznoOk, luhnOk } from "./patterns";

const kinds = (t: string, opts?: Parameters<typeof detectPii>[1]) => detectPii(t, opts).map((h) => `${h.kind}:${h.text}`);

describe("번호류 (high)", () => {
  it("주민·외국인등록번호, 생년월일 형식이 아니면 제외", () => {
    expect(kinds("주민번호 900101-1234567 입니다")).toEqual(["rrn:900101-1234567"]);
    expect(kinds("외국인 9001015234567")).toEqual(["rrn:9001015234567"]);
    expect(kinds("코드 991399-1234567")).toEqual([]); // 13월
  });
  it("휴대폰·유선·+82", () => {
    expect(kinds("연락처 010-1234-5678, 02-123-4567, +82 10 9876 5432")).toEqual([
      "phone:010-1234-5678",
      "phone:02-123-4567",
      "phone:+82 10 9876 5432",
    ]);
  });
  it("이메일", () => {
    expect(kinds("메일은 hong.gd@example.co.kr 로")).toEqual(["email:hong.gd@example.co.kr"]);
  });
  it("카드는 Luhn 통과만", () => {
    expect(luhnOk("4111111111111111")).toBe(true);
    expect(kinds("카드 4111-1111-1111-1111")).toEqual(["card:4111-1111-1111-1111"]);
    expect(kinds("번호 1234-5678-9012-3456")).toEqual([]);
  });
  it("계좌는 문맥 단어 근처 숫자만", () => {
    expect(kinds("국민은행 계좌 123-45-678901 로 입금")).toContainEqual("account:123-45-678901");
    expect(kinds("문서번호 123-45-678901")).toEqual([]);
  });
  it("여권은 문맥 필요, 사업자번호는 검증 숫자 통과만", () => {
    expect(kinds("여권번호 M12345678")).toEqual(["passport:M12345678"]);
    expect(kinds("모델 M12345678")).toEqual([]);
    expect(biznoOk("220-81-62517")).toBe(true);
    expect(kinds("사업자 220-81-62517")).toEqual(["bizno:220-81-62517"]);
    expect(kinds("사업자 220-81-62518")).toEqual([]);
  });
  it("운전면허·IP", () => {
    expect(kinds("면허 11-23-456789-01")).toEqual(["driver:11-23-456789-01"]);
    expect(kinds("서버 192.168.10.25 접속")).toEqual(["ip:192.168.10.25"]);
  });
});

describe("오탐 방지", () => {
  it("날짜·금액·버전·일반 숫자", () => {
    expect(kinds("2026-10-22 회의, 예산 1,234,567원, 버전 1.2.3, 3개 항목, 경로 3")).toEqual([]);
  });
  it("성씨로 시작하는 일반 단어 + 직함", () => {
    expect(kinds("한국 대표 기업, 이번 주 과장 회의, 고객사 대표")).toEqual([]);
  });
  it("일반 명사 + 기관 접미어", () => {
    expect(kinds("종합병원과 시중은행, 신용카드")).toEqual([]);
  });
});

describe("이름·기관·주소 (medium)", () => {
  it("이름 + 호칭: 이름만 잡는다", () => {
    expect(kinds("홍길동 과장님께 전달, 김민 씨와 논의")).toEqual(["person:홍길동", "person:김민"]);
  });
  it("직함 + 이름", () => {
    expect(kinds("담당자 이수정은 다음 주 복귀")).toEqual(["person:이수정"]);
  });
  it("기관: 접두·접미 법인 표기, 고유명 + 기관 접미어, 영문 법인", () => {
    expect(kinds("(주)한빛소프트와 한빛상사 주식회사, 서울대학교병원, 국민은행, Acme Corp.")).toEqual([
      "org:(주)한빛소프트",
      "org:한빛상사 주식회사",
      "org:서울대학교병원",
      "org:국민은행",
      "org:Acme Corp.",
    ]);
  });
  it("도로명·지번 주소", () => {
    const h = kinds("주소는 서울 강남구 테헤란로 123, 4층 401호 입니다. 지번은 성남시 분당구 정자동 178-1");
    expect(h[0]).toBe("address:서울 강남구 테헤란로 123, 4층 401호");
    expect(h[1]).toBe("address:성남시 분당구 정자동 178-1");
  });
});

describe("사용자 사전", () => {
  it("항상 가릴 단어는 종류 custom, 허용 목록은 제외", () => {
    expect(kinds("프로젝트 오로라와 국민은행", { always: ["오로라"], never: ["국민은행"] })).toEqual(["custom:오로라"]);
  });
  it("겹치면 사용자 사전이 이긴다", () => {
    expect(kinds("한빛상사 주식회사", { always: ["한빛상사"] })).toEqual(["custom:한빛상사"]);
  });
});
