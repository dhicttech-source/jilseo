import { create } from "zustand";
import { readStore, writeStore } from "../lib/store";

export interface Favorite {
  id: string;
  name: string;
  url: string;
}

interface FavoritesState {
  list: Favorite[];
  load(): Promise<void>;
  add(name: string, url: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  list: [],
  async load() {
    set({ list: (await readStore<Favorite[]>("favorites").catch(() => null)) ?? [] });
  },
  async add(name, url) {
    if (get().list.some((f) => f.url === url)) return;
    const list = [...get().list, { id: crypto.randomUUID(), name, url }];
    set({ list });
    await writeStore("favorites", list).catch(() => {});
  },
  async remove(id) {
    const list = get().list.filter((f) => f.id !== id);
    set({ list });
    await writeStore("favorites", list).catch(() => {});
  },
}));
