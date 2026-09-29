import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { TODO_SELECTOR_PREFIX, type ServiceDef } from "../adapters";
import { measureViewportInset } from "../lib/panels";
import { assignRole, type PanelRole, type RoleMap, type SendMode } from "../lib/roles";
import { DEFAULT_VERIFY_TEMPLATE } from "../lib/verifyPrompt";

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
  /** 파일 전송 뒤 afterFileBroadcast=new_chat 서비스를 새 채팅으로 이동 (기본 켜짐) */
  newChatAfterFile?: boolean;
  /** UI 크기 배율 (1.0 / 1.15 / 1.3 / 1.5) */
  uiScale?: number;
  /** 전송 모드 (기본 동시 전송) */
  mode?: SendMode;
  /** 파이프라인 역할 배정 (serviceId → 역할). 비어 있으면 첫 AI 패널이 생성, 나머지 검증 */
  roles?: RoleMap;
  /** 검증 패널에 보낼 템플릿 ({question}, {answer}) */
  verifyTemplate?: string;
}

export const UI_SCALES = [1, 1.15, 1.3, 1.5] as const;
const DEFAULT_UI_SCALE = 1.3;

/** 루트 font-size 배율 적용 (Tailwind rem 단위가 함께 커진다) */
export function applyUiScale(scale: number) {
  document.documentElement.style.setProperty("--ui-scale", String(scale));
}

/** 웹슬롯 → ServiceDef (셀렉터 없음, Broadcast 제외) */
export function webSlotToService(w: WebSlot): ServiceDef {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    partition: `persist:${w.id}`,
    selectors: { input: `${TODO_SELECTOR_PREFIX}(web)`, send: `${TODO_SELECTOR_PREFIX}(web)`, response: `${TODO_SELECTOR_PREFIX}(web)` },
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
export const MAX_COLUMNS = 4;

/** 열 수는 1~MAX_COLUMNS */
const clampColumns = (n: number) => Math.min(MAX_COLUMNS, Math.max(1, n));

/** 서비스 목록 = JSON 정의 + 웹슬롯 */
const composeServices = (base: ServiceDef[], webSlots: WebSlot[]) => [...base, ...webSlots.map(webSlotToService)];

/** 스테이지에는 존재하는 서비스만, 최대 MAX_PANELS개 */
const sanitizeStage = (ids: string[], services: ServiceDef[]) => {
  const known = new Set(services.map((s) => s.id));
  return ids.filter((id) => known.has(id)).slice(0, MAX_PANELS);
};

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
  newChatAfterFile: boolean;
  uiScale: number;
  mode: SendMode;
  roles: RoleMap;
  verifyTemplate: string;

  init(): Promise<void>;
  setMode(mode: SendMode): void;
  setRole(id: string, role: PanelRole): void;
  /** 워크스테이션 복원용: 모드와 역할을 한 번에 교체 */
  restorePipeline(mode: SendMode | undefined, roles: RoleMap | undefined): void;
  setVerifyTemplate(t: string): void;
  setNewChatAfterFile(v: boolean): void;
  setUiScale(scale: number): void;
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
    const { stage, columns, maximized, supabase, device, onboarded, webSlots, newChatAfterFile, uiScale, mode, roles, verifyTemplate } =
      get();
    const settings: Settings = {
      version: 1,
      stage,
      columns,
      maximized,
      supabase,
      device,
      onboarded,
      webSlots,
      newChatAfterFile,
      uiScale,
      mode,
      roles,
      verifyTemplate,
    };
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
  newChatAfterFile: true,
  uiScale: DEFAULT_UI_SCALE,
  mode: "broadcast",
  roles: {},
  verifyTemplate: DEFAULT_VERIFY_TEMPLATE,

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
    const services = composeServices(svcRes.services, webSlots);
    const stage = sanitizeStage(settings?.stage ?? DEFAULT_STAGE, services);
    const maximized = settings?.maximized && stage.includes(settings.maximized) ? settings.maximized : null;
    set({
      loaded: true,
      services,
      baseServices: svcRes.services,
      webSlots,
      serviceErrors: svcRes.errors,
      servicesDir: dir,
      stage,
      columns: clampColumns(settings?.columns ?? 3),
      maximized,
      insetTop: inset.top,
      supabase: settings?.supabase ?? null,
      device: settings?.device ?? "mac_studio",
      onboarded: settings?.onboarded ?? false,
      newChatAfterFile: settings?.newChatAfterFile ?? true,
      uiScale: settings?.uiScale ?? DEFAULT_UI_SCALE,
      mode: settings?.mode === "pipeline" ? "pipeline" : "broadcast",
      roles: settings?.roles ?? {},
      verifyTemplate: settings?.verifyTemplate?.trim() ? settings.verifyTemplate : DEFAULT_VERIFY_TEMPLATE,
    });
    applyUiScale(settings?.uiScale ?? DEFAULT_UI_SCALE);
  },

  setMode(mode) {
    set({ mode });
    persist(get);
  },

  setRole(id, role) {
    const { roles, stage, services } = get();
    set({ roles: assignRole(roles, stage, services, id, role) });
    persist(get);
  },

  restorePipeline(mode, roles) {
    set({ mode: mode ?? "broadcast", roles: roles ?? {} });
    persist(get);
  },

  setVerifyTemplate(t) {
    set({ verifyTemplate: t });
    persist(get);
  },

  setUiScale(scale) {
    set({ uiScale: scale });
    applyUiScale(scale);
    persist(get);
  },

  setNewChatAfterFile(v) {
    set({ newChatAfterFile: v });
    persist(get);
  },

  /** 웹슬롯을 등록하고(없으면) 스테이지에도 올린다. 주의: 두 가지 상태를 함께 바꾼다. */
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
      set({ webSlots: next, services: composeServices(baseServices, next) });
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
      services: composeServices(baseServices, next),
      stage: stage.filter((s) => s !== id),
      maximized: maximized === id ? null : maximized,
    });
    persist(get);
  },

  applyLayout(stage, columns) {
    set({
      stage: sanitizeStage(stage, get().services),
      columns: columns ? clampColumns(columns) : get().columns,
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
    set({ columns: clampColumns(n) });
    persist(get);
  },

  setStatus(id, phase, detail) {
    set((s) => ({ status: { ...s.status, [id]: { phase, detail, at: Date.now() } } }));
  },
}));
