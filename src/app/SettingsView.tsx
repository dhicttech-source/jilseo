import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { useCloud } from "../store/cloud";
import { BUILTIN_LENSES, VERDICT_BLOCK, resolveLens } from "../lib/lenses";
import { DEFAULT_REVISE_TEMPLATE, REVISE_TEMPLATE_KEY } from "../lib/revise";
import { UI_SCALES, useStage } from "../store/stage";
import { openExportsDir } from "../lib/exportFile";

const input = "rounded border border-white/15 bg-white/5 px-2 py-1.5 text-sm text-white/90 outline-none focus:border-white/40";

/** 렌더 함수 밖에 정의해야 한다 — 안에서 정의하면 매 렌더마다 새 컴포넌트로 취급되어 입력창이 리마운트되고 포커스가 빠진다 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-white/50">
      {label}
      {children}
    </label>
  );
}

/** 스테이지를 대체하는 전체 화면 설정 (오버레이는 네이티브 webview 아래에 깔리므로) */
export function SettingsView({ onClose }: { onClose: () => void }) {
  const supabase = useStage((s) => s.supabase);
  const setSupabase = useStage((s) => s.setSupabase);
  const device = useStage((s) => s.device);
  const setDevice = useStage((s) => s.setDevice);
  const servicesDir = useStage((s) => s.servicesDir);
  const newChatAfterFile = useStage((s) => s.newChatAfterFile);
  const uiScale = useStage((s) => s.uiScale);
  const setUiScale = useStage((s) => s.setUiScale);
  const setNewChatAfterFile = useStage((s) => s.setNewChatAfterFile);
  const piiMode = useStage((s) => s.piiMode);
  const setPiiMode = useStage((s) => s.setPiiMode);
  const piiAlways = useStage((s) => s.piiAlways);
  const piiNever = useStage((s) => s.piiNever);
  const setPiiWords = useStage((s) => s.setPiiWords);
  const [alwaysText, setAlwaysText] = useState(piiAlways.join("\n"));
  const [neverText, setNeverText] = useState(piiNever.join("\n"));
  const baseServices = useStage((s) => s.baseServices);
  const usageLimits = useStage((s) => s.usageLimits);
  const setUsageLimit = useStage((s) => s.setUsageLimit);
  const lensOverrides = useStage((s) => s.lensOverrides);
  const customLenses = useStage((s) => s.customLenses);
  const setLensOverride = useStage((s) => s.setLensOverride);
  const addCustomLens = useStage((s) => s.addCustomLens);
  const removeCustomLens = useStage((s) => s.removeCustomLens);
  const [lensId, setLensId] = useState(BUILTIN_LENSES[0].id);
  const [newLensName, setNewLensName] = useState("");
  const allLenses = [...BUILTIN_LENSES, ...customLenses];
  const lens = resolveLens(lensId, lensOverrides, customLenses);
  const overridden = !!lensOverrides[lens.id];
  const cloud = useCloud();
  const [url, setUrl] = useState(supabase?.url ?? "");
  const [anonKey, setAnonKey] = useState(supabase?.anonKey ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const saveConfig = async () => {
    setSupabase(url.trim() && anonKey.trim() ? { url: url.trim(), anonKey: anonKey.trim() } : null);
    await cloud.init();
  };


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
          <h2 className="text-sm font-medium text-white/85">Supabase (기존 프로젝트에 함께 사용)</h2>
          <p className="text-xs text-white/40">
            프롬프트 라이브러리·메모·비교 기록·성적표를 두 기기 간 공유합니다. 사용 중인 Supabase 프로젝트의 Project Settings → API Keys 에서 Project URL과 Publishable key를 넣으세요(Secret key는 넣지 마세요).
            먼저 <code className="text-white/60">supabase/schema.sql</code>을 그 프로젝트의 SQL Editor에서 실행하면 <code className="text-white/60">jilseo_</code> 접두어 테이블이 생깁니다.
            저장 뒤 아래에서 그 프로젝트의 기존 계정으로 로그인해야 "로그인됨"이 됩니다.
          </p>
          <Field label="Project URL">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" className={input} />
          </Field>
          <Field label="anon / publishable key (sb_publishable_… 또는 eyJ…)">
            <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} placeholder="sb_publishable_…" className={input} />
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
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={input}
                  />
                </Field>
                <Field label="비밀번호">
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && email && password && void cloud.signIn(email, password)}
                    className={input}
                  />
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

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">화면</h2>
          <Field label="UI 크기 (글씨·버튼 배율, 패널 영역은 그만큼 줄어듦)">
            <div className="flex gap-2">
              {UI_SCALES.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setUiScale(sc)}
                  className={"rounded px-3 py-1 text-xs " + (uiScale === sc ? "bg-white/20 text-white/90" : "bg-white/5 text-white/50")}
                >
                  {Math.round(sc * 100)}%
                </button>
              ))}
            </div>
          </Field>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">Broadcast</h2>
          <label className="flex items-start gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={newChatAfterFile}
              onChange={(e) => setNewChatAfterFile(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              파일 전송 뒤 새 채팅으로 이동 (ChatGPT)
              <span className="block text-white/40">
                ChatGPT는 파일을 첨부한 대화방에서 이후 응답이 생성되지 않는 경우가 있어, 응답 수집이 끝나면 패널을 새 채팅으로 옮깁니다.
                서비스 JSON의 <code>afterFileBroadcast</code>로 대상 서비스를 정합니다.
              </span>
            </span>
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">비식별화 (전송 전 개인정보·기관명 가리기)</h2>
          <p className="text-xs text-white/40">
            보내기 직전에 프롬프트와 첨부 문서에서 주민·전화·이메일·카드·계좌·주소·이름·기관명 등을 이 기기 안에서 찾아(외부 전송 없음) 기호로 바꿉니다.
            같은 대상은 프롬프트와 문서 전체에서 같은 기호(예: [인물A])가 되고, 원래 값은 이 기기 메모리에만 남아 요약 카드·내보내기에서 되돌려 볼 수 있습니다.
            docx·pptx·xlsx·PDF는 텍스트로 변환해 보내며(서식·이미지 제외), 이미지와 스캔 PDF는 검사할 수 없어 원본/첨부 빼기 중에서 고르게 합니다.
          </p>
          <div className="flex gap-2">
            {(["review", "auto", "off"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPiiMode(m)}
                className={"rounded px-3 py-1 text-xs " + (piiMode === m ? "bg-white/20 text-white/90" : "bg-white/5 text-white/50")}
              >
                {m === "review" ? "검토 (기본)" : m === "auto" ? "자동" : "끔"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="항상 가릴 단어 (한 줄에 하나, 2글자 이상) — 회사명·고객사·프로젝트명 등">
              <textarea
                value={alwaysText}
                onChange={(e) => setAlwaysText(e.target.value)}
                onBlur={() => setPiiWords("always", alwaysText.split("\n"))}
                rows={5}
                className={input + " resize-y"}
              />
            </Field>
            <Field label="가리지 않을 단어 — 공공기관·공개 인물 등 (검토 패널의 &quot;항상 허용&quot;도 여기에 쌓임)">
              <textarea
                value={neverText}
                onChange={(e) => setNeverText(e.target.value)}
                onBlur={() => setPiiWords("never", neverText.split("\n"))}
                rows={5}
                className={input + " resize-y"}
              />
            </Field>
          </div>
          <p className="text-xs text-white/35">
            규칙 기반 탐지라 호칭 없는 이름·외국인 이름·약어로 쓴 기관명은 놓칠 수 있습니다. 검토 패널에서 직접 추가하거나 "항상 가릴 단어"에 넣어 두세요. 서비스에 로그인한 계정 자체의 신원은 가릴 수 없습니다.
          </p>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">전송 횟수 한도 경고</h2>
          <p className="text-xs text-white/40">
            서비스별 오늘 전송 횟수는 독의 칩에 표시됩니다. 하루 한도를 적어 두면 도달했을 때 전송 바가 경고합니다(전송을 막지는 않음). 0이면 경고 없음. 무료 플랜의 메시지 제한을 미리 알아채는 용도입니다.
          </p>
          <div className="flex flex-wrap gap-3">
            {baseServices.map((svc) => (
              <label key={svc.id} className="flex items-center gap-2 text-xs text-white/70">
                <span className="w-20">{svc.name}</span>
                <input
                  type="number"
                  min={0}
                  value={usageLimits[svc.id] ?? 0}
                  onChange={(e) => setUsageLimit(svc.id, Number(e.target.value) || 0)}
                  className={input + " w-20"}
                />
                <span className="text-white/35">회/일</span>
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">검증 렌즈 (생성 → 검증 파이프라인)</h2>
          <p className="text-xs text-white/40">
            검증 패널마다 렌즈 하나를 배정합니다(패널 헤더의 역할 칩 옆). 렌즈는 방법론 템플릿이고{" "}
            <code className="text-white/60">{"{question}"}</code>·<code className="text-white/60">{"{answer}"}</code>가 질문과 생성 답변으로 바뀝니다.
            모든 렌즈 끝에는 같은 판정 블록이 자동으로 붙어 요약 카드가 등급·건수·핵심을 읽습니다.
          </p>
          <div className="flex flex-wrap gap-1">
            {allLenses.map((l) => (
              <button
                key={l.id}
                onClick={() => setLensId(l.id)}
                title={l.description}
                className={
                  "rounded-full border px-2.5 py-1 text-xs " +
                  (l.id === lens.id ? "border-white/40 bg-white/15 text-white/90" : "border-white/10 text-white/50 hover:text-white/80")
                }
              >
                {l.icon} {l.name}
                {lensOverrides[l.id] ? " *" : ""}
              </button>
            ))}
          </div>
          <div className="text-xs text-white/50">
            {lens.description}
            {lens.recommended.length > 0 && ` · 권장: ${lens.recommended.join(", ")}`}
          </div>
          <Field label={`${lens.name} 템플릿${overridden ? " (수정됨)" : ""}`}>
            <textarea
              value={lens.template}
              onChange={(e) => setLensOverride(lens.id, e.target.value)}
              rows={12}
              className={input + " resize-y font-mono"}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            {lens.builtin ? (
              <button
                onClick={() => setLensOverride(lens.id, "")}
                disabled={!overridden}
                className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 disabled:opacity-30"
              >
                기본 템플릿으로 되돌리기
              </button>
            ) : (
              <button onClick={() => { removeCustomLens(lens.id); setLensId(BUILTIN_LENSES[0].id); }} className="rounded bg-rose-500/20 px-3 py-1 text-xs text-rose-200">
                이 렌즈 삭제
              </button>
            )}
            <span className="ml-auto flex items-center gap-1">
              <input
                value={newLensName}
                onChange={(e) => setNewLensName(e.target.value)}
                placeholder="새 렌즈 이름"
                className={input + " w-32"}
              />
              <button
                onClick={() => {
                  const id = addCustomLens(newLensName, `[질문]\n{question}\n\n[답변]\n{answer}\n\n검토 지시를 여기에 쓰세요.`);
                  setNewLensName("");
                  setLensId(id);
                }}
                disabled={!newLensName.trim()}
                className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 disabled:opacity-30"
              >
                추가
              </button>
            </span>
          </div>
          <details className="text-xs text-white/40">
            <summary className="cursor-pointer">모든 렌즈에 붙는 판정 블록 보기</summary>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-white/50">{VERDICT_BLOCK}</pre>
          </details>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border border-white/10 p-4">
          <h2 className="text-sm font-medium text-white/85">수정 단계 템플릿</h2>
          <p className="text-xs text-white/40">
            심층 깊이에서 자동으로, 다른 깊이에서는 요약 카드의 "지적 반영 수정본 요청"으로 생성 패널에 보냅니다. 같은 대화에 보내므로 질문과 원답은 넣지 않고{" "}
            <code className="text-white/60">{"{verdicts}"}</code>에 검증 판정들이 들어갑니다.
          </p>
          <Field label={`템플릿${lensOverrides[REVISE_TEMPLATE_KEY] ? " (수정됨)" : ""}`}>
            <textarea
              value={lensOverrides[REVISE_TEMPLATE_KEY] || DEFAULT_REVISE_TEMPLATE}
              onChange={(e) => setLensOverride(REVISE_TEMPLATE_KEY, e.target.value)}
              rows={8}
              className={input + " resize-y font-mono"}
            />
          </Field>
          <button
            onClick={() => setLensOverride(REVISE_TEMPLATE_KEY, "")}
            disabled={!lensOverrides[REVISE_TEMPLATE_KEY]}
            className="self-start rounded bg-white/10 px-3 py-1 text-xs text-white/80 disabled:opacity-30"
          >
            기본 템플릿으로 되돌리기
          </button>
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
          <button onClick={() => void openExportsDir()} className="self-start rounded bg-white/10 px-3 py-1 text-xs text-white/80">
            내보내기 폴더 열기 (exports/*.md)
          </button>
        </section>
      </div>
    </main>
  );
}
