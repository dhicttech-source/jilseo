import { create } from "zustand";
import type { Attachment } from "../adapters";

/** Broadcast 바의 첨부 파일 1개 (UI·하네스 공용) */
interface AttachmentState {
  file: Attachment | null;
  set(file: Attachment | null): void;
}

export const useAttachment = create<AttachmentState>((set) => ({
  file: null,
  set: (file) => set({ file }),
}));

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
