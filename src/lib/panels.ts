import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelLayout {
  service_id: string;
  rect: Rect;
}

export interface ViewportInset {
  /** 네이티브 콘텐츠 뷰 기준으로 DOM 원점이 아래로 밀린 양 (타이틀바 안전영역) */
  top: number;
  nativeInnerHeight: number;
  domHeight: number;
}

/**
 * macOS에서 창 콘텐츠 뷰가 타이틀바까지 덮는 경우(fullSizeContentView),
 * UI webview의 DOM은 타이틀바만큼 아래에서 시작하지만 자식 webview의 좌표계는
 * 콘텐츠 뷰 최상단이 원점이다. 둘의 높이 차이가 곧 y 보정값이다.
 */
export async function measureViewportInset(): Promise<ViewportInset> {
  const win = getCurrentWindow();
  const [inner, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
  const nativeInnerHeight = Math.round(inner.height / scale);
  const domHeight = document.documentElement.clientHeight;
  return { top: Math.max(0, nativeInnerHeight - domHeight), nativeInnerHeight, domHeight };
}

/** DOM 요소의 뷰포트 좌표 → 창 논리 좌표 (y는 타이틀바 인셋만큼 보정) */
export function rectOf(el: Element, insetTop = 0): Rect {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top + insetTop),
    width: Math.max(1, Math.round(r.width)),
    height: Math.max(1, Math.round(r.height)),
  };
}

export const createPanel = (serviceId: string, url: string, rect: Rect) =>
  invoke<string>("create_panel", { serviceId, url, rect });

export const layoutPanels = (layouts: PanelLayout[]) =>
  invoke<void>("layout_panels", { layouts });

export const destroyPanel = (serviceId: string) =>
  invoke<void>("destroy_panel", { serviceId });

export const panelUrl = (serviceId: string) =>
  invoke<string | null>("panel_url", { serviceId });
