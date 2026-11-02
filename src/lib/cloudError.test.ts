import { describe, expect, it } from "vitest";
import { cloudErrorMessage, isCloudUnreachable, needsCloudRetry, UNREACHABLE_MESSAGE } from "./cloudError";

describe("isCloudUnreachable", () => {
  it("fetch 실패 문구(WebKit·Chromium·Node)는 연결 불가", () => {
    expect(isCloudUnreachable({ message: "TypeError: Load failed" })).toBe(true);
    expect(isCloudUnreachable({ message: "TypeError: Failed to fetch" })).toBe(true);
    expect(isCloudUnreachable({ message: "fetch failed" })).toBe(true);
  });

  it("상태 0과 5xx(일시 중지 응답 540 포함)는 연결 불가", () => {
    expect(isCloudUnreachable({ message: "", status: 0 })).toBe(true);
    expect(isCloudUnreachable({ message: "Service Unavailable", status: 503 })).toBe(true);
    expect(isCloudUnreachable({ message: "Project paused", status: 540 })).toBe(true);
  });

  it("권한(RLS)·인증·입력 오류는 일시 중지로 보지 않음", () => {
    expect(isCloudUnreachable({ message: "new row violates row-level security policy", status: 403 })).toBe(false);
    expect(isCloudUnreachable({ message: "Invalid login credentials", status: 400 })).toBe(false);
    expect(isCloudUnreachable({ message: "JWT expired", status: 401 })).toBe(false);
  });

  it("오류 없음·빈 오류는 false", () => {
    expect(isCloudUnreachable(null)).toBe(false);
    expect(isCloudUnreachable({})).toBe(false);
  });
});

describe("cloudErrorMessage", () => {
  it("연결 불가면 원인과 할 일 문구", () => {
    expect(cloudErrorMessage({ message: "Load failed" }, "조회 실패")).toBe(UNREACHABLE_MESSAGE);
  });

  it("그 밖의 오류는 접두어 + 원문, 원문이 없으면 알 수 없는 오류", () => {
    expect(cloudErrorMessage({ message: "permission denied", status: 403 }, "조회 실패")).toBe("조회 실패: permission denied");
    expect(cloudErrorMessage({ status: 400 }, "조회 실패")).toBe("조회 실패: 알 수 없는 오류");
  });
});

describe("needsCloudRetry", () => {
  it("로그인 + 대기열 남음, 또는 연결 실패면 재시도", () => {
    expect(needsCloudRetry("signed_in", 3)).toBe(true);
    expect(needsCloudRetry("error", 0)).toBe(true);
  });

  it("대기열이 비었거나 로그아웃 상태면 재시도하지 않음", () => {
    expect(needsCloudRetry("signed_in", 0)).toBe(false);
    expect(needsCloudRetry("signed_out", 5)).toBe(false);
    expect(needsCloudRetry("checking", 5)).toBe(false);
  });
});
