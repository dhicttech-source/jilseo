import { create } from "zustand";

/** Broadcast 입력창 초안. 프롬프트 라이브러리가 여기로 삽입한다. */
interface DraftState {
  text: string;
  set(text: string): void;
  insert(text: string): void;
}

export const useDraft = create<DraftState>((set) => ({
  text: "",
  set: (text) => set({ text }),
  insert: (t) => set((s) => ({ text: s.text ? `${s.text}\n${t}` : t })),
}));
