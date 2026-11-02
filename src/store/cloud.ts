import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { envConfig, flushQueue, getClient, queueLength, type SupabaseConfig } from "../lib/supabase";
import { CLOUD_RETRY_MS, isCloudUnreachable, needsCloudRetry, UNREACHABLE_MESSAGE } from "../lib/cloudError";
import { useStage } from "./stage";

interface CloudState {
  user: User | null;
  /** error = 서버에 닿지 못함(일시 중지·오프라인). 잘못된 비밀번호 같은 오류는 signed_out + message */
  status: "idle" | "checking" | "signed_in" | "signed_out" | "error";
  message: string | null;
  queued: number;
  config(): SupabaseConfig | null;
  init(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  flush(): Promise<void>;
}

/** 예외를 상태로: 연결 불가면 error + 안내 문구, 아니면 원문 */
function failure(e: unknown): Pick<CloudState, "status" | "message"> {
  const message = e instanceof Error ? e.message : String(e);
  return isCloudUnreachable({ message }) ? { status: "error", message: UNREACHABLE_MESSAGE } : { status: "error", message };
}

let authSub: { unsubscribe(): void } | null = null;

export const useCloud = create<CloudState>((set, get) => ({
  user: null,
  status: "idle",
  message: null,
  queued: 0,

  config() {
    return envConfig() ?? useStage.getState().supabase;
  },

  async init() {
    const cfg = get().config();
    set({ queued: await queueLength() });
    if (!cfg) return set({ status: "signed_out", message: "Supabase 미설정" });
    set({ status: "checking" });
    try {
      const c = getClient(cfg)!;
      const { data, error } = await c.auth.getSession();
      // 만료된 토큰을 갱신하다 서버에 닿지 못하면 세션이 비어 오는데, 로그아웃이 아니라 연결 실패로 본다
      if (error && isCloudUnreachable(error)) return set({ status: "error", message: UNREACHABLE_MESSAGE });
      set({ user: data.session?.user ?? null, status: data.session ? "signed_in" : "signed_out", message: null });
      authSub?.unsubscribe(); // init은 재시도·설정 저장 때 다시 불리므로 구독이 쌓이지 않게 한다
      authSub = c.auth.onAuthStateChange((_e, session) => {
        set({ user: session?.user ?? null, status: session ? "signed_in" : "signed_out" });
      }).data.subscription;
      if (data.session) await get().flush();
    } catch (e) {
      set(failure(e));
    }
  },

  async signIn(email, password) {
    const cfg = get().config();
    const c = getClient(cfg);
    if (!c) return set({ status: "signed_out", message: "Supabase URL / anon key를 먼저 저장하세요" });
    set({ status: "checking", message: null });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return set(isCloudUnreachable(error) ? { status: "error", message: UNREACHABLE_MESSAGE } : { status: "signed_out", message: error.message });
    set({ user: data.user, status: "signed_in", message: null });
    await get().flush();
  },

  async signOut() {
    const c = getClient(get().config());
    await c?.auth.signOut();
    set({ user: null, status: "signed_out" });
  },

  async flush() {
    try {
      const left = await flushQueue(get().config());
      set({
        queued: left,
        message: left > 0 ? `대기열 ${left}건이 아직 올라가지 않았습니다. 5분마다, 그리고 앱으로 돌아올 때 다시 시도합니다` : null,
      });
    } catch (e) {
      set({ queued: await queueLength(), ...failure(e) });
    }
  },
}));

// ---------- 자동 재시도: Supabase 무료 프로젝트가 일시 중지됐다 복구되면 저절로 다시 연결하고 대기열을 올린다 ----------

let retryTimer: ReturnType<typeof setInterval> | null = null;
let retrying = false;

/** 재시도 한 번: 연결 실패 상태면 다시 연결(init이 성공하면 대기열도 올림), 로그인 상태면 대기열만 */
async function retryOnce() {
  const s = useCloud.getState();
  if (retrying || !needsCloudRetry(s.status, s.queued)) return;
  retrying = true;
  try {
    if (s.status === "error") await s.init();
    else await s.flush();
  } finally {
    retrying = false;
  }
}

/** 상태가 바뀔 때마다: 재시도가 필요하면 타이머를 켜고, 필요 없어지면 끈다 */
function syncRetryTimer() {
  const { status, queued } = useCloud.getState();
  const need = needsCloudRetry(status, queued);
  if (need && !retryTimer) retryTimer = setInterval(() => void retryOnce(), CLOUD_RETRY_MS);
  else if (!need && retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

useCloud.subscribe(syncRetryTimer);
if (typeof window !== "undefined") window.addEventListener("focus", () => void retryOnce());
