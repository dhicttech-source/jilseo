import { PanelSlot } from "./PanelSlot";
import { useStage } from "../store/stage";

export function Stage() {
  const services = useStage((s) => s.services);
  const stage = useStage((s) => s.stage);
  const columns = useStage((s) => s.columns);
  const maximized = useStage((s) => s.maximized);

  const visible = (maximized ? stage.filter((id) => id === maximized) : stage)
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const cols = Math.max(1, Math.min(columns, visible.length));

  if (visible.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-white/40">
        아래 독에서 서비스를 눌러 스테이지에 올리세요
      </main>
    );
  }

  return (
    <main
      className="grid min-h-0 flex-1 gap-[2px] bg-white/10 p-[2px]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {visible.map((svc) => (
        <PanelSlot key={svc.id} service={svc} />
      ))}
    </main>
  );
}
