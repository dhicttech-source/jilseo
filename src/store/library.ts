import { create } from "zustand";
import { readStore, writeStore } from "../lib/store";
import { deleteOrQueue, getClient, saveRow } from "../lib/supabase";
import { useCloud } from "./cloud";

export interface Prompt {
  id: string;
  folder: string | null;
  title: string | null;
  body: string;
  created_at: string;
}

interface LibraryState {
  prompts: Prompt[];
  open: boolean;
  message: string | null;
  toggle(): void;
  load(): Promise<void>;
  refresh(): Promise<void>;
  add(p: { folder: string; title: string; body: string }): Promise<void>;
  remove(id: string): Promise<void>;
}

const cache = (prompts: Prompt[]) => writeStore("prompts_cache", prompts).catch(() => {});

export const useLibrary = create<LibraryState>((set, get) => ({
  prompts: [],
  open: false,
  message: null,

  toggle: () => set((s) => ({ open: !s.open })),

  /** 로컬 캐시 먼저 → 로그인돼 있으면 클라우드로 갱신 */
  async load() {
    const cached = (await readStore<Prompt[]>("prompts_cache").catch(() => null)) ?? [];
    set({ prompts: cached });
    await get().refresh();
  },

  async refresh() {
    const c = getClient(useCloud.getState().config());
    if (!c || useCloud.getState().status !== "signed_in") return;
    const { data, error } = await c.from("prompts").select("id,folder,title,body,created_at").order("folder").order("created_at");
    if (error) return set({ message: `동기화 실패: ${error.message}` });
    set({ prompts: data as Prompt[], message: null });
    await cache(data as Prompt[]);
  },

  async add({ folder, title, body }) {
    const cloud = useCloud.getState();
    const row: Prompt = {
      id: crypto.randomUUID(),
      folder: folder.trim() || null,
      title: title.trim() || null,
      body,
      created_at: new Date().toISOString(),
    };
    const prompts = [...get().prompts, row];
    set({ prompts });
    await cache(prompts);
    const res = await saveRow(cloud.config(), cloud.user, "prompts", { ...row });
    set({ message: res === "queued" ? "오프라인 — 큐에 저장됨" : null });
    await useCloud.getState().flush();
  },

  async remove(id) {
    const prompts = get().prompts.filter((p) => p.id !== id);
    set({ prompts });
    await cache(prompts);
    await deleteOrQueue(useCloud.getState().config(), "prompts", id);
    await useCloud.getState().flush();
  },
}));
