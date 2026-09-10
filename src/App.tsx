import { useEffect, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { BroadcastBar } from "./app/BroadcastBar";
import { Dock } from "./app/Dock";
import { Onboarding } from "./app/Onboarding";
import { PromptLibrary } from "./app/PromptLibrary";
import { SettingsView } from "./app/SettingsView";
import { Stage } from "./app/Stage";
import { WorkstationBar } from "./app/WorkstationBar";
import { useCloud } from "./store/cloud";
import { useLibrary } from "./store/library";
import { useStage } from "./store/stage";
import { useWorkstations } from "./store/workstations";
import { runDiagnostics, summarize } from "./lib/diagnostics";

type View = "stage" | "settings";

export default function App() {
  const loaded = useStage((s) => s.loaded);
  const init = useStage((s) => s.init);
  const remeasureInset = useStage((s) => s.remeasureInset);
  const serviceErrors = useStage((s) => s.serviceErrors);
  const servicesDir = useStage((s) => s.servicesDir);
  const stage = useStage((s) => s.stage);
  const services = useStage((s) => s.services);
  const onboarded = useStage((s) => s.onboarded);
  const libraryOpen = useLibrary((s) => s.open);
  const cloudStatus = useCloud((s) => s.status);
  const queued = useCloud((s) => s.queued);
  const [view, setView] = useState<View>("stage");
  const [diag, setDiag] = useState<string | null>(null);

  const diagnose = async () => {
    setDiag("진단 중…");
    const targets = stage.map((id) => services.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
    try {
      const { items } = await runDiagnostics(targets);
      setDiag(summarize(items));
    } catch (e) {
      setDiag(`진단 실패: ${String(e)}`);
    }
  };

  useEffect(() => {
    void (async () => {
      await init();
      await useWorkstations.getState().load();
      await useCloud.getState().init();
      await useLibrary.getState().load();
    })();
  }, [init]);

  useEffect(() => {
    const onResize = () => void remeasureInset();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [remeasureInset]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-white/10 px-3 text-xs text-white/60">
        <span className="font-medium text-white/85">질서 疾書</span>
        <span className="text-white/35">{stage.length}개 패널</span>
        {loaded && <WorkstationBar />}
        {serviceErrors.length > 0 && (
          <span className="text-rose-400" title={serviceErrors.join("\n")}>
            서비스 정의 오류 {serviceErrors.length}건
          </span>
        )}
        {diag && <span className="ml-2 font-mono text-[10px] text-white/45">{diag}</span>}
        <button
          className="ml-auto rounded px-2 py-0.5 text-white/45 hover:bg-white/10 hover:text-white/80"
          title="셀렉터 존재 여부와 응답 스냅샷을 diagnostics.json에 기록"
          onClick={() => void diagnose()}
        >
          진단
        </button>
        <button
          className="rounded px-2 py-0.5 text-white/45 hover:bg-white/10 hover:text-white/80"
          title={servicesDir}
          onClick={() => servicesDir && revealItemInDir(servicesDir).catch(() => {})}
        >
          셀렉터 JSON 폴더
        </button>
        <button
          className={"rounded px-2 py-0.5 hover:bg-white/10 " + (view === "settings" ? "bg-white/15 text-white/90" : "text-white/45 hover:text-white/80")}
          title={`Supabase: ${cloudStatus}${queued ? ` · 대기열 ${queued}` : ""}`}
          onClick={() => setView(view === "settings" ? "stage" : "settings")}
        >
          설정{cloudStatus === "signed_in" ? " ●" : queued ? ` (${queued})` : ""}
        </button>
      </header>

      {!loaded ? (
        <main className="flex-1" />
      ) : !onboarded ? (
        <Onboarding onSettings={() => setView("settings")} />
      ) : view === "settings" ? (
        <SettingsView onClose={() => setView("stage")} />
      ) : (
        <Stage />
      )}

      {loaded && onboarded && view === "stage" && (
        <>
          {libraryOpen && <PromptLibrary />}
          <Dock />
          <BroadcastBar />
        </>
      )}
    </div>
  );
}
