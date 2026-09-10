import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { invoke } from "@tauri-apps/api/core";

/** 렌더 전/중 치명적 오류를 화면과 dev_results.json(개발 빌드)에 남긴다 — 빈 화면으로 죽지 않도록 */
function reportFatal(where: string, err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  const el = document.getElementById("root");
  if (el && !el.childElementCount) {
    // innerHTML 대신 textContent: 오류 문자열에 페이지 내용이 섞여도 HTML로 해석되지 않게
    const pre = document.createElement("pre");
    pre.style.cssText = "padding:16px;color:#f88;font:12px/1.5 monospace;white-space:pre-wrap";
    pre.textContent = `질서 시작 오류 (${where})\n${msg}`;
    el.replaceChildren(pre);
  }
  if (import.meta.env.DEV) {
    invoke("write_store", { name: "dev_results", value: { id: "fatal", type: where, ok: false, result: { error: msg }, finished: Date.now() } }).catch(() => {});
  }
}
window.addEventListener("error", (e) => reportFatal("window.error", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => reportFatal("unhandledrejection", e.reason));

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (e) {
  reportFatal("render", e);
}
