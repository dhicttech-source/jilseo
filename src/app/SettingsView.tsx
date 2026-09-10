import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { useCloud } from "../store/cloud";
import { useStage } from "../store/stage";

/** 스테이지를 대체하는 전체 화면 설정 (오버레이는 네이티브 webview 아래에 깔리므로) */
export function SettingsView({ onClose }: { onClose: () => void }) {
  const supabase = useStage((s) => s.supabase);
  const setSupabase = useStage((s) => s.setSupabase);
  const device = useStage((s) => s.device);
  const setDevice = useStage((s) => s.setDevice);
  const servicesDir = useStage((s) => s.servicesDir);
  const cloud = useCloud();
  const [url, setUrl] = useState(supabase?.url ?? "");
  const [anonKey, setAnonKey] = useState(supabase?.anonKey ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const saveConfig = async () => {
    setSupabase(url.trim() && anonKey.trim() ? { url: url.trim(), anonKey: anonKey.trim() } : null);
    await cloud.init();
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1 text-xs text-white/50">
      {label}
      {children}
    </label>
  );
  const input = "rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/40";

  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-medium text-white/90">설정</h1>
          <button onClick={onClose} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20">
            스테이지로 돌아가기
          </button>
        </div>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">Supabase (Free 프로젝트 `jilseo`)</h2>
          <p className="text-xs text-white/40">
            프롬프트 라이브러리·메모·비교 기록을 두 맥 간 공유합니다. 대시보드 → Project Settings → API 의 URL과 anon key.
            <code className="ml-1 text-white/60">supabase/schema.sql</code>을 SQL Editor에서 먼저 실행하세요.
          </p>
          <Field label="Project URL">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" className={input} />
          </Field>
          <Field label="anon key">
            <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="eyJ…" className={input} />
          </Field>
          <div className="flex items-center gap-2">
            <button onClick={() => void saveConfig()} className="rounded bg-white/90 px-3 py-1.5 text-xs font-medium text-black">
              저장
            </button>
            <span className="text-xs text-white/40">
              상태: {cloud.status}
              {cloud.user ? ` · ${cloud.user.email}` : ""}
              {cloud.queued > 0 ? ` · 대기열 ${cloud.queued}건` : ""}
            </span>
          </div>
          {cloud.message && <div className="text-xs text-amber-400">{cloud.message}</div>}

          <div className="mt-2 border-t border-white/10 pt-3">
            {cloud.status === "signed_in" ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">로그인됨: {cloud.user?.email}</span>
                <button onClick={() => void cloud.signOut()} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80">
                  로그아웃
                </button>
                <button onClick={() => void cloud.flush()} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80">
                  대기열 재시도
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Field label="이메일">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                </Field>
                <Field label="비밀번호">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
                </Field>
                <button
                  onClick={() => void cloud.signIn(email, password)}
                  disabled={!email || !password}
                  className="rounded bg-white/90 px-3 py-1.5 text-xs font-medium text-black disabled:opacity-30"
                >
                  로그인
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">이 기기</h2>
          <Field label="기기 이름 (비교 기록의 device 필드)">
            <div className="flex gap-2">
              {["mac_studio", "macbook"].map((d) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={"rounded px-3 py-1 text-xs " + (device === d ? "bg-white/20 text-white/90" : "bg-white/5 text-white/50")}
                >
                  {d}
                </button>
              ))}
              <input value={device} onChange={(e) => setDevice(e.target.value)} className={input + " w-32"} />
            </div>
          </Field>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">파일</h2>
          <button
            onClick={() => servicesDir && revealItemInDir(servicesDir).catch(() => {})}
            className="self-start rounded bg-white/10 px-3 py-1 text-xs text-white/80"
          >
            셀렉터 JSON 폴더 열기
          </button>
          <button
            onClick={() => invoke<string>("app_data_dir").then((p) => revealItemInDir(p)).catch(() => {})}
            className="self-start rounded bg-white/10 px-3 py-1 text-xs text-white/80"
          >
            앱 데이터 폴더 열기 (settings · workstations · queue)
          </button>
        </section>
      </div>
    </main>
  );
}
