/**
 * Supabase 연결 오류 분류. 무료 프로젝트는 7일 동안 요청이 없으면 일시 중지되는데,
 * 그동안 요청은 네트워크 오류나 5xx(중지 응답 540 포함)로 실패한다. 권한(RLS)·입력 오류는 여기에 들지 않는다.
 */

export interface CloudErrorLike {
  message?: string;
  /** HTTP 상태. fetch 자체가 실패하면 0 */
  status?: number;
}

const NETWORK_MESSAGE = /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_name_not_resolved|enotfound|econnrefused|timed? ?out/i;

/** 서버에 닿지 못했거나 서버가 응답할 수 없는 상태인가 (일시 중지·복구 중·오프라인) */
export function isCloudUnreachable(err: CloudErrorLike | null | undefined): boolean {
  if (!err) return false;
  if (err.status === 0 || (err.status !== undefined && err.status >= 500)) return true;
  return NETWORK_MESSAGE.test(err.message ?? "");
}

export const UNREACHABLE_MESSAGE =
  "Supabase에 연결할 수 없습니다. 무료 프로젝트가 일시 중지됐을 수 있습니다(7일 미사용). Supabase 대시보드에서 Restore하면 대기열은 자동으로 올라갑니다";

/** 화면에 보일 오류 문구: 연결 불가면 원인과 할 일을, 아니면 "<prefix>: 원문" */
export function cloudErrorMessage(err: CloudErrorLike, prefix: string): string {
  return isCloudUnreachable(err) ? UNREACHABLE_MESSAGE : `${prefix}: ${err.message ?? "알 수 없는 오류"}`;
}

/** 자동 재시도가 필요한 상태: 로그인돼 있는데 대기열이 남았거나, 연결에 실패했을 때. 로그아웃 상태는 사용자가 로그인해야 하므로 제외 */
export function needsCloudRetry(status: string, queued: number): boolean {
  return (status === "signed_in" && queued > 0) || status === "error";
}

export const CLOUD_RETRY_MS = 5 * 60_000;
