import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { TODO_SELECTOR_PREFIX, type ServiceDef } from "../adapters";
import { measureViewportInset } from "../lib/panels";
import { assignRole, type PanelRole, type RoleMap, type SendMode } from "../lib/roles";
import { DEFAULT_VERIFY_TEMPLATE } from "../lib/verifyPrompt";
import { COMPOSITE_LENS_ID, type Lens } from "../lib/lenses";
import { applyPreset, findPreset, type Depth } from "../lib/presets";
import { validateServices } from "../lib/serviceSchema";
import type { PiiMode } from "../lib/pii/prepare";

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
  /** (구) 검증 템플릿. 읽을 때 lensOverrides.composite로 이전하고 더 쓰지 않는다 */
  verifyTemplate?: string;
  /** 검증 패널 → 렌즈 id. 미배정은 종합 렌즈 */
  lensAssign?: Record<string, string>;
  /** 내장·사용자 렌즈의 템플릿 덮어쓰기 (렌즈 id → 템플릿) */
  lensOverrides?: Record<string, string>;
  /** 사용자 정의 렌즈 */
  customLenses?: Lens[];
  /** 검토 깊이 (빠름/표준/심층) */
  depth?: Depth;
  /** 마지막으로 적용한 프리셋 id (표시용) */
  presetId?: string | null;
  /** 서비스별 하루 전송 한도 경고 (0·미설정 = 없음). 전송을 막지는 않는다 */
  usageLimits?: Record<string, number>;
  /** 동시 전송·파이프라인 생성 단계 프롬프트 앞에 붙는 접두어 (워크스테이션별 개인화) */
  promptPrefix?: string;
  /** 전송 전 비식별화: 끔 / 검토(기본) / 자동 */
  piiMode?: PiiMode;
  /** 항상 가릴 단어 */
  piiAlways?: string[];
  /** 가리지 않을 단어 */
  piiNever?: string[];
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

/** 구 설정 verifyTemplate → 종합 렌즈 덮어쓰기. 기본값과 같거나 비었으면 버린다 */
const migrateVerifyTemplate = (overrides: Record<string, string>, legacy: string | undefined) => {
  if (!legacy?.trim() || legacy === DEFAULT_VERIFY_TEMPLATE || overrides[COMPOSITE_LENS_ID]) return overrides;
  return { ...overrides, [COMPOSITE_LENS_ID]: legacy };
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
  lensAssign: Record<string, string>;
  lensOverrides: Record<string, string>;
  customLenses: Lens[];
  depth: Depth;
  presetId: string | null;
  usageLimits: Record<string, number>;
  promptPrefix: string;
  piiMode: PiiMode;
  piiAlways: string[];
  piiNever: string[];

  init(): Promise<void>;
  setPiiMode(mode: PiiMode): void;
  setPiiWords(list: "always" | "never", words: string[]): void;
  /** 단어 하나를 허용 목록(가리지 않음)에 추가 — 검토 패널의 "항상 허용" */
  allowPiiWord(word: string): void;
  setUsageLimit(serviceId: string, limit: number): void;
  setPromptPrefix(prefix: string): void;
  setDepth(depth: Depth): void;
  /** 프리셋 적용: 역할·렌즈 배정과 기본 깊이를 바꾼다. 반환: 배정 결과(표시용). 모르는 id면 null */
  applyPresetToStage(presetId: string): ReturnType<typeof applyPreset> | null;
  setMode(mode: SendMode): void;
  setRole(id: string, role: PanelRole): void;
  /** 워크스테이션 복원용: 모드·역할·렌즈 배정을 한 번에 교체 */
  restorePipeline(
    mode: SendMode | undefined,
    roles: RoleMap | undefined,
    lensAssign?: Record<string, string>,
    depth?: Depth,
    presetId?: string | null,
    promptPrefix?: string,
  ): void;
  setLens(serviceId: string, lensId: string): void;
  /** 템플릿 덮어쓰기. 빈 문자열이면 덮어쓰기 제거(기본 복원) */
  setLensOverride(lensId: string, template: string): void;
  addCustomLens(name: string, template: string): string;
  removeCustomLens(lensId: string): void;
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
    const {
      stage, columns, maximized, supabase, device, onboarded, webSlots, newChatAfterFile, uiScale, mode, roles,
      lensAssign, lensOverrides, customLenses, depth, presetId, usageLimits, promptPrefix, piiMode, piiAlways, piiNever,
    } = get();
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
      lensAssign,
      lensOverrides,
      customLenses,
      depth,
      presetId,
      usageLimits,
      promptPrefix,
      piiMode,
      piiAlways,
      piiNever,
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
  lensAssign: {},
  lensOverrides: {},
  customLenses: [],
  depth: "standard",
  presetId: null,
  usageLimits: {},
  promptPrefix: "",
  piiMode: "review",
  piiAlways: [],
  piiNever: [],

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
    // 서비스 JSON 스키마 검증: 잘못된 정의는 제외하고 사유를 헤더에 표시
    const checked = validateServices(svcRes.services, (item) => `${(item as { id?: string })?.id ?? "?"}.json`);
    const serviceErrors = [...svcRes.errors, ...checked.errors];
    const services = composeServices(checked.services, webSlots);
    const stage = sanitizeStage(settings?.stage ?? DEFAULT_STAGE, services);
    const maximized = settings?.maximized && stage.includes(settings.maximized) ? settings.maximized : null;
    set({
      loaded: true,
      services,
      baseServices: checked.services,
      webSlots,
      serviceErrors,
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
      lensAssign: settings?.lensAssign ?? {},
      lensOverrides: migrateVerifyTemplate(settings?.lensOverrides ?? {}, settings?.verifyTemplate),
      customLenses: settings?.customLenses ?? [],
      depth: settings?.depth ?? "standard",
      presetId: settings?.presetId ?? null,
      usageLimits: settings?.usageLimits ?? {},
      promptPrefix: settings?.promptPrefix ?? "",
      piiMode: settings?.piiMode ?? "review",
      piiAlways: settings?.piiAlways ?? [],
      piiNever: settings?.piiNever ?? [],
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

  restorePipeline(mode, roles, lensAssign, depth, presetId, promptPrefix) {
    set({
      mode: mode ?? "broadcast",
      roles: roles ?? {},
      lensAssign: lensAssign ?? {},
      depth: depth ?? "standard",
      presetId: presetId ?? null,
      promptPrefix: promptPrefix ?? "",
    });
    persist(get);
  },

  setUsageLimit(serviceId, limit) {
    set((s) => {
      const next = { ...s.usageLimits };
      if (limit > 0) next[serviceId] = Math.floor(limit);
      else delete next[serviceId];
      return { usageLimits: next };
    });
    persist(get);
  },

  setPromptPrefix(prefix) {
    set({ promptPrefix: prefix });
    persist(get);
  },

  setPiiMode(mode) {
    set({ piiMode: mode });
    persist(get);
  },

  setPiiWords(list, words) {
    const clean = [...new Set(words.map((w) => w.trim()).filter((w) => w.length >= 2))];
    set(list === "always" ? { piiAlways: clean } : { piiNever: clean });
    persist(get);
  },

  allowPiiWord(word) {
    const w = word.trim();
    if (!w || get().piiNever.includes(w)) return;
    set((s) => ({ piiNever: [...s.piiNever, w], piiAlways: s.piiAlways.filter((x) => x !== w) }));
    persist(get);
  },

  setDepth(depth) {
    set({ depth });
    persist(get);
  },

  applyPresetToStage(presetId) {
    const preset = findPreset(presetId);
    if (!preset) return null;
    const { stage, services, roles } = get();
    const currentGen = Object.entries(roles).find(([, r]) => r === "generate")?.[0] ?? null;
    const app = applyPreset(preset, stage, services, currentGen);
    // 렌즈 배정은 프리셋이 정한 패널만 바꾸고 나머지는 유지 (제외된 패널의 렌즈는 다음에 다시 검증으로 올릴 때 쓰인다)
    set((s) => ({ roles: app.roles, lensAssign: { ...s.lensAssign, ...app.lensAssign }, depth: preset.defaultDepth, presetId: preset.id }));
    persist(get);
    return app;
  },

  setLens(serviceId, lensId) {
    set((s) => ({ lensAssign: { ...s.lensAssign, [serviceId]: lensId } }));
    persist(get);
  },

  setLensOverride(lensId, template) {
    set((s) => {
      const next = { ...s.lensOverrides };
      if (template.trim()) next[lensId] = template;
      else delete next[lensId];
      return { lensOverrides: next };
    });
    persist(get);
  },

  addCustomLens(name, template) {
    const id = `lens-${crypto.randomUUID().slice(0, 8)}`;
    const lens: Lens = { id, name: name.trim() || "내 렌즈", icon: "★", description: "사용자 렌즈", template, recommended: [], builtin: false };
    set((s) => ({ customLenses: [...s.customLenses, lens] }));
    persist(get);
    return id;
  },

  removeCustomLens(lensId) {
    set((s) => {
      const overrides = { ...s.lensOverrides };
      delete overrides[lensId];
      const lensAssign = Object.fromEntries(Object.entries(s.lensAssign).filter(([, v]) => v !== lensId));
      return { customLenses: s.customLenses.filter((l) => l.id !== lensId), lensOverrides: overrides, lensAssign };
    });
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
