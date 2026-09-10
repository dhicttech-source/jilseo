import { useMemo, useState } from "react";
import { useDraft } from "../store/draft";
import { useLibrary } from "../store/library";

/** Broadcast 바 위에 접히는 프롬프트 라이브러리. 스테이지 밖 영역만 사용(webview 위 오버레이 금지). */
export function PromptLibrary() {
  const prompts = useLibrary((s) => s.prompts);
  const message = useLibrary((s) => s.message);
  const add = useLibrary((s) => s.add);
  const remove = useLibrary((s) => s.remove);
  const refresh = useLibrary((s) => s.refresh);
  const insert = useDraft((s) => s.insert);
  const [folder, setFolder] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ folder: "", title: "", body: "" });

  const folders = useMemo(() => {
    const set = new Set(prompts.map((p) => p.folder ?? "(없음)"));
    return Array.from(set).sort();
  }, [prompts]);
  const shown = prompts.filter((p) => folder === null || (p.folder ?? "(없음)") === folder);

  return (
    <div className="flex h-44 shrink-0 border-t border-white/10 text-xs">
      <div className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/10 p-2">
        <button
          onClick={() => setFolder(null)}
          className={"rounded px-2 py-1 text-left " + (folder === null ? "bg-white/15 text-white/90" : "text-white/50 hover:bg-white/5")}
        >
          전체 ({prompts.length})
        </button>
        {folders.map((f) => (
          <button
            key={f}
            onClick={() => setFolder(f)}
            className={"rounded px-2 py-1 text-left " + (folder === f ? "bg-white/15 text-white/90" : "text-white/50 hover:bg-white/5")}
          >
            {f}
          </button>
        ))}
        <div className="mt-auto flex gap-1 pt-1">
          <button onClick={() => setAdding((v) => !v)} className="rounded bg-white/10 px-2 py-1 text-white/80 hover:bg-white/20">
            {adding ? "취소" : "+ 추가"}
          </button>
          <button onClick={() => void refresh()} className="rounded px-2 py-1 text-white/40 hover:bg-white/10" title="클라우드에서 다시 불러오기">
            ↻
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {adding ? (
          <div className="flex flex-1 flex-col gap-1 p-2">
            <div className="flex gap-1">
              <input
                value={form.folder}
                onChange={(e) => setForm({ ...form, folder: e.target.value })}
                placeholder="폴더"
                className="w-32 rounded border border-white/15 bg-white/5 px-2 py-1 text-white/90 outline-none"
              />
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="제목"
                className="flex-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-white/90 outline-none"
              />
              <button
                disabled={!form.body.trim()}
                onClick={async () => {
                  await add(form);
                  setForm({ folder: "", title: "", body: "" });
                  setAdding(false);
                }}
                className="rounded bg-white/90 px-3 py-1 font-medium text-black disabled:opacity-30"
              >
                저장
              </button>
            </div>
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="프롬프트 본문"
              className="flex-1 resize-none rounded border border-white/15 bg-white/5 px-2 py-1 text-white/90 outline-none"
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {message && <div className="text-amber-400">{message}</div>}
            {shown.length === 0 && <div className="text-white/30">프롬프트가 없습니다. + 추가로 만들거나 로그인 후 ↻로 불러오세요.</div>}
            {shown.map((p) => (
              <div key={p.id} className="group flex items-start gap-2 rounded px-2 py-1 hover:bg-white/5">
                <button onClick={() => insert(p.body)} className="min-w-0 flex-1 text-left" title="입력창에 삽입">
                  <span className="text-white/85">{p.title || p.body.slice(0, 40)}</span>
                  {p.folder && <span className="ml-2 text-white/30">{p.folder}</span>}
                  <div className="truncate text-white/40">{p.body}</div>
                </button>
                <button
                  onClick={() => void remove(p.id)}
                  className="invisible rounded px-1 text-white/30 hover:bg-rose-500/20 hover:text-rose-300 group-hover:visible"
                  title="삭제"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
