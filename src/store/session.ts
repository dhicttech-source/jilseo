import { create } from "zustand";

/**
 * 앱 세션 동안만 유지되는 상태 (설정에 저장하지 않음).
 * - ephemeral: 임시 전송. 켜져 있으면 비교 기록·채택·수정본을 클라우드에 저장하지 않는다 (LibreChat의 Temporary Chat).
 * - lastBroadcast: 마지막 동시 전송 결과 (Markdown 내보내기용)
 */
export interface LastBroadcast {
  prompt: string;
  responses: Record<string, string>;
  at: number;
  ephemeral: boolean;
}

interface SessionState {
  ephemeral: boolean;
  lastBroadcast: LastBroadcast | null;
  setEphemeral(v: boolean): void;
  setLastBroadcast(b: LastBroadcast | null): void;
}

export const useSession = create<SessionState>((set) => ({
  ephemeral: false,
  lastBroadcast: null,
  setEphemeral: (ephemeral) => set({ ephemeral }),
  setLastBroadcast: (lastBroadcast) => set({ lastBroadcast }),
}));
