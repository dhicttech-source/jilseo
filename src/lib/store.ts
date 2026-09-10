import { invoke } from "@tauri-apps/api/core";

export type StoreName =
  | "workstations"
  | "presets"
  | "session"
  | "queue"
  | "prompts_cache"
  | "notes_cache"
  | "favorites"
  | "dev_commands"
  | "dev_results";

export const readStore = <T>(name: StoreName) => invoke<T | null>("read_store", { name });
export const writeStore = (name: StoreName, value: unknown) => invoke<void>("write_store", { name, value });
