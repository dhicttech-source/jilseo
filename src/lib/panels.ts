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

/** 패널 안에서 JS 실행. 결과는 wry가 JSON 직렬화한 문자열 → 한 번(필요 시 두 번) 파싱 */
export async function evalInPanel<T = unknown>(
  serviceId: string,
  js: string,
  timeoutMs = 10_000,
): Promise<T> {
  // 예외가 나면 wry가 콜백을 호출하지 않아 타임아웃까지 기다리게 되므로 페이지 안에서 잡는다.
  const wrapped = `(() => { try { return (${js}); } catch (e) { return JSON.stringify({ __error: String(e && e.stack || e) }); } })()`;
  const raw = await invoke<string>("eval_in_panel", { serviceId, js: wrapped, timeoutMs });
  let v: unknown = raw;
  try {
    v = JSON.parse(raw);
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        /* 문자열 자체가 결과 */
      }
    }
  } catch {
    /* 직렬화되지 않은 원시 문자열 */
  }
  if (v && typeof v === "object" && "__error" in (v as Record<string, unknown>)) {
    throw new Error(`[${serviceId}] page error: ${(v as { __error: string }).__error}`);
  }
  return v as T;
}

export const setPanelVisible = (serviceId: string, visible: boolean) =>
  invoke<void>("set_panel_visible", { serviceId, visible });

export const navigatePanel = (serviceId: string, url: string) =>
  invoke<void>("navigate_panel", { serviceId, url });
