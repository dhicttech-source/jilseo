import { create } from "zustand";
import { readStore, writeStore } from "../lib/store";
import { navigatePanel, panelUrl } from "../lib/panels";
import type { RoleMap, SendMode } from "../lib/roles";
import { useStage } from "./stage";

export interface WorkstationPanel {
  serviceId: string;
  conversationUrl: string | null;
}

export interface Workstation {
  id: string;
  name: string;
  panels: WorkstationPanel[];
  columns: number;
  /** 전송 모드와 파이프라인 역할 (없으면 동시 전송·기본 역할). 워크스테이션이 곧 파이프라인 프리셋 */
  mode?: SendMode;
  roles?: RoleMap;
  /** 검증 패널 → 렌즈 id */
  lensAssign?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

interface WorkstationsState {
  list: Workstation[];
  activeId: string | null;
  /** 패널 생성 직후 이동시킬 URL (PanelSlot이 소비) */
  pendingUrls: Record<string, string>;
  load(): Promise<void>;
  saveCurrent(name: string, id?: string): Promise<Workstation>;
  apply(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  takePendingUrl(serviceId: string): string | null;
}

const persist = (list: Workstation[]) => writeStore("workstations", list).catch(() => {});

export const useWorkstations = create<WorkstationsState>((set, get) => ({
  list: [],
  activeId: null,
  pendingUrls: {},

  async load() {
    const list = (await readStore<Workstation[]>("workstations").catch(() => null)) ?? [];
    set({ list });
  },

  /** 현재 스테이지 구성 + 각 패널의 대화 URL을 캡처 */
  async saveCurrent(name, id) {
    const { stage, columns, mode, roles, lensAssign } = useStage.getState();
    const panels: WorkstationPanel[] = await Promise.all(
      stage.map(async (serviceId) => ({
        serviceId,
        conversationUrl: await panelUrl(serviceId).catch(() => null),
      })),
    );
    const now = Date.now();
    const existing = id ? get().list.find((w) => w.id === id) : undefined;
    const ws: Workstation = {
      id: existing?.id ?? crypto.randomUUID(),
      name: name.trim() || existing?.name || `워크스테이션 ${get().list.length + 1}`,
      panels,
      columns,
      mode,
      roles,
      lensAssign,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const list = existing ? get().list.map((w) => (w.id === ws.id ? ws : w)) : [...get().list, ws];
    set({ list, activeId: ws.id });
    await persist(list);
    return ws;
  },

  /** 스테이지 교체 → 이미 있는 패널은 즉시 이동, 새로 생기는 패널은 pendingUrls로 */
  async apply(id) {
    const ws = get().list.find((w) => w.id === id);
    if (!ws) return;
    const stageStore = useStage.getState();
    const current = new Set(stageStore.stage);
    const pending: Record<string, string> = {};
    for (const p of ws.panels) {
      if (!p.conversationUrl) continue;
      if (current.has(p.serviceId)) navigatePanel(p.serviceId, p.conversationUrl).catch(() => {});
      else pending[p.serviceId] = p.conversationUrl;
    }
    set({ activeId: id, pendingUrls: pending });
    stageStore.applyLayout(
      ws.panels.map((p) => p.serviceId),
      ws.columns,
    );
    stageStore.restorePipeline(ws.mode, ws.roles, ws.lensAssign);
  },

  async remove(id) {
    const list = get().list.filter((w) => w.id !== id);
    set({ list, activeId: get().activeId === id ? null : get().activeId });
    await persist(list);
  },

  takePendingUrl(serviceId) {
    const url = get().pendingUrls[serviceId] ?? null;
    if (url) {
      const rest = { ...get().pendingUrls };
      delete rest[serviceId];
      set({ pendingUrls: rest });
    }
    return url;
  },
}));
