import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { envConfig, flushQueue, getClient, queueLength, type SupabaseConfig } from "../lib/supabase";
import { useStage } from "./stage";

interface CloudState {
  user: User | null;
  status: "idle" | "checking" | "signed_in" | "signed_out" | "error";
  message: string | null;
  queued: number;
  config(): SupabaseConfig | null;
  init(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  flush(): Promise<void>;
}

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
      const { data } = await c.auth.getSession();
      set({ user: data.session?.user ?? null, status: data.session ? "signed_in" : "signed_out", message: null });
      c.auth.onAuthStateChange((_e, session) => {
        set({ user: session?.user ?? null, status: session ? "signed_in" : "signed_out" });
      });
      if (data.session) await get().flush();
    } catch (e) {
      set({ status: "error", message: String(e) });
    }
  },

  async signIn(email, password) {
    const cfg = get().config();
    const c = getClient(cfg);
    if (!c) return set({ status: "error", message: "Supabase URL / anon key를 먼저 저장하세요" });
    set({ status: "checking", message: null });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return set({ status: "error", message: error.message });
    set({ user: data.user, status: "signed_in", message: null });
    await get().flush();
  },

  async signOut() {
    const c = getClient(get().config());
    await c?.auth.signOut();
    set({ user: null, status: "signed_out" });
  },

  async flush() {
    const left = await flushQueue(get().config());
    set({ queued: left });
  },
}));
