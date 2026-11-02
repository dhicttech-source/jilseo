import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { recordsInfo, type RecordsInfo } from "../lib/comparisons";
import { copyText } from "../lib/exportFile";
import { formatBytes } from "../lib/localRecords";
import { useCloud } from "../store/cloud";
import { useScorecard } from "../store/scorecard";

type Scope = "device" | "all";

/**
 * 설정 맨 위 "기록 저장 위치": 비교 기록 파일(comparisons.json)의 경로·건수·크기·동기화 상태와 지우기.
 * Supabase를 연결했으면 "이 기기만"과 "모두(Supabase 포함)" 두 가지로 지운다. 둘 다 두 번 눌러야 지워진다.
 */
export function RecordsStorage() {
  const configured = useCloud((s) => !!s.config());
  const status = useCloud((s) => s.status);
  const queued = useCloud((s) => s.queued);
  const clear = useScorecard((s) => s.clear);
  const [info, setInfo] = useState<RecordsInfo | null>(null);
  const [confirm, setConfirm] = useState<Scope | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => void recordsInfo().then(setInfo).catch(() => setInfo(null));
  useEffect(refresh, []);

  const signedIn = status === "signed_in";
  const syncText = !configured
    ? "Supabase 미연결 — 이 기기에만 저장"
    : signedIn
      ? "Supabase 연결됨 — 두 기기 동기화·백업"
      : "Supabase 설정됨, 로그인 안 됨 — 로그인하면 올라감";

  const reveal = () => {
    if (info?.exists) void revealItemInDir(info.path).catch(() => {});
    else void invoke<string>("app_data_dir").then((p) => revealItemInDir(p)).catch(() => {});
  };
  const copy = () => info && void copyText(info.path).then((ok) => setNote(ok ? "경로를 복사했습니다" : "복사하지 못했습니다"));

  const run = async (scope: Scope) => {
    if (confirm !== scope) {
      setConfirm(scope);
      setNote(null);
      return;
    }
    setConfirm(null);
    try {
      const n = await clear(scope);
      setNote(scope === "device" && configured ? `이 기기 기록 ${n}건을 지웠습니다. Supabase에 있는 기록은 다음에 성적표를 열 때 다시 받아 옵니다` : `기록 ${n}건을 지웠습니다${configured ? " (Supabase 포함)" : ""}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
    refresh();
  };

  const count = info?.count ?? 0;
  const btn = (scope: Scope, label: string, disabled = false, title?: string) => (
    <button
      onClick={() => void run(scope)}
      disabled={disabled || count === 0}
      title={title}
      className={"rounded px-3 py-1 text-xs disabled:opacity-30 " + (confirm === scope ? "bg-rose-500/80 text-white" : "bg-white/10 text-white/80 hover:bg-white/20")}
    >
      {confirm === scope ? `${count}건 지우기 — 한 번 더 눌러 확인` : label}
    </button>
  );

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
      <h2 className="text-sm font-medium text-white/85">기록 저장 위치</h2>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 select-all break-all rounded bg-white/5 px-2 py-1 text-xs text-white/75">{info?.path ?? "확인 중…"}</code>
        <button onClick={copy} disabled={!info} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20 disabled:opacity-30">
          경로 복사
        </button>
        <button onClick={reveal} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20">
          폴더에서 보기
        </button>
      </div>
      <div className="text-xs text-white/55">
        기록 {count}건 · {formatBytes(info?.bytes ?? 0)} · {syncText}
        {queued > 0 ? ` · 대기열 ${queued}건` : ""}
      </div>
      <p className="text-xs text-white/40">
        보낸 질문과 받은 답변, ★/✕ 평가, 채택이 이 파일에 저장되고 성적표·기록 탭이 이 파일로 집계합니다. 비식별화로 가린 경우 가려진 문장이 저장되고, 🔒 임시 전송은 저장되지 않습니다. 서비스 로그인
        정보·쿠키는 앱이 다루지 않습니다. 기기를 바꿀 때는 이 파일을 같은 위치로 옮기거나 Supabase를 연결하세요.
        {configured && " 파일을 직접 지워도 Supabase에 있는 기록은 다음 동기화 때 다시 받아 옵니다 — 완전히 없애려면 \"모든 기록 지우기\"를 쓰세요."}
      </p>
      <div className="flex flex-wrap gap-2">
        {configured ? (
          <>
            {btn("device", "이 기기 기록 지우기")}
            {btn("all", "모든 기록 지우기 (Supabase 포함, 되돌릴 수 없음)", !signedIn, signedIn ? undefined : "Supabase에 로그인해야 서버 기록까지 지울 수 있습니다")}
          </>
        ) : (
          btn("all", "기록 지우기 (되돌릴 수 없음)")
        )}
        {confirm && (
          <button onClick={() => setConfirm(null)} className="rounded px-3 py-1 text-xs text-white/60 hover:bg-white/10">
            취소
          </button>
        )}
      </div>
      {note && <div className="text-xs text-sky-300">{note}</div>}
    </section>
  );
}
