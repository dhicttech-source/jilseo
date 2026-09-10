import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ServiceDef } from "../adapters";
import { measureViewportInset } from "../lib/panels";

export type PanelPhase =
  | "creating"
  | "ready"
  | "queued"
  | "attaching"
  | "inserting"
  | "submitting"
  | "sent"
  | "responding"
  | "done"
  | "error";

export interface PanelStatus {
  phase: PanelPhase;
  detail?: string;
  at: number;
}

export interface SupabaseSettings {
  url: string;
  anonKey: string;
}

export interface WebSlot {
  id: string;
  name: string;
  url: string;
}

interface Settings {
  version: 1;
  stage: string[];
  columns: number;
  maximized: string | null;
  supabase?: SupabaseSettings | null;
  device?: string;
  onboarded?: boolean;
  webSlots?: WebSlot[];
}

/** 웹슬롯 → ServiceDef (셀렉터 없음, Broadcast 제외) */
export function webSlotToService(w: WebSlot): ServiceDef {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    partition: `persist:${w.id}`,
    selectors: { input: "TODO(web)", send: "TODO(web)", response: "TODO(web)" },
    kind: "web",
  };
}

function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const DEFAULT_STAGE = ["chatgpt", "claude", "gemini"];
export const MAX_PANELS = 8;

interface StageState {
  loaded: boolean;
  services: ServiceDef[];
  serviceErrors: string[];
  servicesDir: string;
  stage: string[];
  columns: number;
  maximized: string | null;
  insetTop: number;
  status: Record<string, PanelStatus>;
  supabase: SupabaseSettings | null;
  device: string;
  onboarded: boolean;
  /** JSON 서비스 정의 (웹슬롯 제외) */
  baseServices: ServiceDef[];
  webSlots: WebSlot[];

  init(): Promise<void>;
  addWebSlot(url: string, name?: string): string | null;
  removeWebSlot(id: string): void;
  applyLayout(stage: string[], columns?: number): void;
  setSupabase(cfg: SupabaseSettings | null): void;
  setDevice(name: string): void;
  setOnboarded(v: boolean): void;
  remeasureInset(): Promise<void>;
  toggleStage(id: string): void;
  setMaximized(id: string | null): void;
  setColumns(n: number): void;
  setStatus(id: string, phase: PanelPhase, detail?: string): void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(get: () => StageState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { stage, columns, maximized, supabase, device, onboarded, webSlots } = get();
    const settings: Settings = { version: 1, stage, columns, maximized, supabase, device, onboarded, webSlots };
    invoke("write_settings", { settings }).catch(() => {});
  }, 200);
}

export const useStage = create<StageState>((set, get) => ({
  loaded: false,
  services: [],
  serviceErrors: [],
  servicesDir: "",
  stage: [],
  columns: 3,
  maximized: null,
  insetTop: 0,
  status: {},
  supabase: null,
  device: "mac_studio",
  onboarded: false,
  baseServices: [],
  webSlots: [],

  async init() {
    const [svcRes, settings, dir, inset] = await Promise.all([
      invoke<{ services: ServiceDef[]; errors: string[] }>("load_services").catch((e) => ({
        services: [] as ServiceDef[],
        errors: [String(e)],
      })),
      invoke<Partial<Settings> | null>("read_settings").catch(() => null),
      invoke<string>("services_dir").catch(() => ""),
      measureViewportInset().catch(() => ({ top: 0 })),
    ]);
    const webSlots = settings?.webSlots ?? [];
    const services = [...svcRes.services, ...webSlots.map(webSlotToService)];
    const known = new Set(services.map((s) => s.id));
    const stage = (settings?.stage ?? DEFAULT_STAGE).filter((id) => known.has(id)).slice(0, MAX_PANELS);
    const maximized = settings?.maximized && stage.includes(settings.maximized) ? settings.maximized : null;
    set({
      loaded: true,
      services,
      baseServices: svcRes.services,
      webSlots,
      serviceErrors: svcRes.errors,
      servicesDir: dir,
      stage,
      columns: Math.min(4, Math.max(1, settings?.columns ?? 3)),
      maximized,
      insetTop: inset.top,
      supabase: settings?.supabase ?? null,
      device: settings?.device ?? "mac_studio",
      onboarded: settings?.onboarded ?? false,
    });
  },

  addWebSlot(url, name) {
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    } catch {
      return null;
    }
    const id = `web-${hashId(parsed.href)}`;
    const { webSlots, baseServices, stage } = get();
    if (!webSlots.some((w) => w.id === id)) {
      const slot: WebSlot = { id, name: name?.trim() || parsed.hostname.replace(/^www\./, ""), url: parsed.href };
      const next = [...webSlots, slot];
      set({ webSlots: next, services: [...baseServices, ...next.map(webSlotToService)] });
    }
    if (!stage.includes(id) && stage.length < MAX_PANELS) set({ stage: [...stage, id] });
    persist(get);
    return id;
  },

  removeWebSlot(id) {
    const { webSlots, baseServices, stage, maximized } = get();
    const next = webSlots.filter((w) => w.id !== id);
    set({
      webSlots: next,
      services: [...baseServices, ...next.map(webSlotToService)],
      stage: stage.filter((s) => s !== id),
      maximized: maximized === id ? null : maximized,
    });
    persist(get);
  },

  applyLayout(stage, columns) {
    const known = new Set(get().services.map((s) => s.id));
    set({
      stage: stage.filter((id) => known.has(id)).slice(0, MAX_PANELS),
      columns: columns ? Math.min(4, Math.max(1, columns)) : get().columns,
      maximized: null,
    });
    persist(get);
  },

  setSupabase(cfg) {
    set({ supabase: cfg });
    persist(get);
  },

  setDevice(name) {
    set({ device: name.trim() || "mac" });
    persist(get);
  },

  setOnboarded(v) {
    set({ onboarded: v });
    persist(get);
  },

  async remeasureInset() {
    const m = await measureViewportInset().catch(() => null);
    if (m && m.top !== get().insetTop) set({ insetTop: m.top });
  },

  toggleStage(id) {
    const { stage, maximized } = get();
    const next = stage.includes(id)
      ? stage.filter((s) => s !== id)
      : stage.length >= MAX_PANELS
        ? stage
        : [...stage, id];
    set({ stage: next, maximized: maximized && next.includes(maximized) ? maximized : null });
    persist(get);
  },

  setMaximized(id) {
    set({ maximized: id });
    persist(get);
  },

  setColumns(n) {
    set({ columns: Math.min(4, Math.max(1, n)) });
    persist(get);
  },

  setStatus(id, phase, detail) {
    set((s) => ({ status: { ...s.status, [id]: { phase, detail, at: Date.now() } } }));
  },
}));
