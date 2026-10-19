import { create } from "zustand";
import { readStore, writeStore } from "../lib/store";
import { countToday, emptyUsage, recordSend, type UsageLog } from "../lib/usage";

/** 서비스별 전송 횟수 (로컬 usage.json). 전송 성공 경로(sendAndCollect)가 record()를 부른다 */
interface UsageState {
  log: UsageLog;
  today: Record<string, number>;
  load(): Promise<void>;
  record(serviceIds: string[]): Promise<void>;
  refreshToday(): void;
}

export const useUsage = create<UsageState>((set, get) => ({
  log: emptyUsage(),
  today: {},
  async load() {
    const log = (await readStore<UsageLog>("usage").catch(() => null)) ?? emptyUsage();
    set({ log: { sent: log.sent ?? {} }, today: countToday({ sent: log.sent ?? {} }) });
  },
  async record(serviceIds) {
    if (serviceIds.length === 0) return;
    const log = recordSend(get().log, serviceIds);
    set({ log, today: countToday(log) });
    await writeStore("usage", log).catch(() => {});
  },
  refreshToday() {
    set({ today: countToday(get().log) });
  },
}));
