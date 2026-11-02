import { invoke } from "@tauri-apps/api/core";

export type StoreName =
  | "workstations"
  | "presets"
  | "session"
  | "queue"
  | "prompts_cache"
  | "notes_cache"
  | "favorites"
  | "usage"
  | "comparisons"
  | "dev_commands"
  | "dev_results"
  | "dev_heartbeat";

export const readStore = <T>(name: StoreName) => invoke<T | null>("read_store", { name });
export const writeStore = (name: StoreName, value: unknown) => invoke<void>("write_store", { name, value });

export interface StoreInfo {
  path: string;
  exists: boolean;
  bytes: number;
}
export const storeInfo = (name: StoreName) => invoke<StoreInfo>("store_info", { name });
