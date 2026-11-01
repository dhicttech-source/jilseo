import { useMemo, useState } from "react";
import { BUILTIN_LENSES, GRADE_LABEL, type Judged } from "../lib/lenses";
import { copyText, saveExport } from "../lib/exportFile";
import { emptyRating, toggleBest, toggleFail, withRating } from "../lib/rating";
import { emptyFilter, matchesFilter, readRecord, recordToMarkdown, summaryLine, withJudged, type RecordDetail, type RecordFilter } from "../lib/records";
import { useDraft } from "../store/draft";
import { usePipelineResult } from "../store/pipelineResult";
import { useScorecard } from "../store/scorecard";
import { useSession } from "../store/session";
import { useStage } from "../store/stage";
import { GRADE_CLASS, JUDGE } from "./VerdictCard";

const STEP = 50;
const when = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const firstLine = (s: string) => s.trim().split("\n")[0]?.slice(0, 120) || "(빈 프롬프트)";

/**
 * 성적표의 기록 탭: 조회해 둔 비교 기록을 검색·필터하고, 펼쳐서 응답·검증을 읽고 평가·채택을 고친다.
 * 고친 내용은 같은 행에 저장되고 집계 탭 숫자에 바로 반영된다.
 */
export function ScorecardRecords({ filter, setFilter, onClose }: { filter: RecordFilter; setFilter: (f: RecordFilter) => void; onClose: () => void }) {
  const rows = useScorecard((s) => s.rows);
  const hasMore = useScorecard((s) => s.hasMore);
  const loading = useScorecard((s) => s.loading);
  const loadMore = useScorecard((s) => s.loadMore);
  const services = useStage((s) => s.services);
  const customLenses = useStage((s) => s.customLenses);
  const [shown, setShown] = useState(STEP);
  const [openId, setOpenId] = useState<string | null>(null);

  const name = (id: string) => services.find((x) => x.id === id)?.name ?? id;
  const allLenses = [...BUILTIN_LENSES, ...customLenses];
  const lensName = (id: string) => allLenses.find((l) => l.id === id)?.name ?? id;

  const details = useMemo(() => rows.map(readRecord), [rows]);
  const filtered = useMemo(() => details.filter((d) => matchesFilter(d, filter)), [details, filter]);
  const chips: { label: string; clear: Partial<RecordFilter> }[] = [];
  if (filter.generator) chips.push({ label: `생성 ${name(filter.generator)}`, clear: { generator: undefined } });
  if (filter.service) chips.push({ label: `${filter.kind === "broadcast" ? "응답" : "검증"} ${name(filter.service)}`, clear: { service: undefined } });
  if (filter.lens) chips.push({ label: `렌즈 ${lensName(filter.lens)}`, clear: { lens: undefined } });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filter.q}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
          placeholder="프롬프트·응답 검색 (공백으로 여러 단어)"
          className="min-w-64 flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-sm text-white/85 placeholder:text-white/30"
        />
        <select
          value={filter.kind}
          onChange={(e) => setFilter({ ...filter, kind: e.target.value as RecordFilter["kind"] })}
          className="rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/80"
        >
          <option value="all">전체</option>
          <option value="broadcast">동시 전송</option>
          <option value="pipeline">생성 → 검증</option>
        </select>
        {chips.map((c) => (
          <button key={c.label} onClick={() => setFilter({ ...filter, ...c.clear })} className="rounded bg-sky-400/15 px-2 py-0.5 text-xs text-sky-200 hover:bg-sky-400/25" title="조건 해제">
            {c.label} ✕
          </button>
        ))}
        {(chips.length > 0 || filter.q || filter.kind !== "all") && (
          <button onClick={() => setFilter(emptyFilter())} className="text-xs text-white/40 hover:text-white/80">
            모두 해제
          </button>
        )}
        <span className="ml-auto text-xs text-white/40">
          {filtered.length}건 / 조회 {rows.length}건
        </span>
      </div>

      {filtered.length === 0 && <p className="text-xs text-white/40">{rows.length ? "조건에 맞는 기록이 없습니다." : "조회한 기록이 없습니다."}</p>}

      <ul className="flex flex-col gap-1">
        {filtered.slice(0, shown).map((d) => (
          <li key={d.id} className="rounded-lg border border-white/10">
            <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5">
              <span className="w-32 shrink-0 text-xs text-white/40">{when(d.at)}</span>
              <span className={"shrink-0 rounded px-1.5 py-0.5 text-xs " + (d.kind === "pipeline" ? "bg-violet-400/15 text-violet-200" : "bg-white/10 text-white/60")}>
                {d.kind === "pipeline" ? "생성→검증" : "동시"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-white/85" title={d.prompt.slice(0, 500)}>
                {firstLine(d.prompt)}
              </span>
              {d.masked && <span className="shrink-0 rounded bg-amber-400/15 px-1.5 py-0.5 text-xs text-amber-200">가림</span>}
              <span className="shrink-0 text-xs text-white/50">{summaryLine(d, name)}</span>
              {d.device && <span className="shrink-0 text-xs text-white/30">{d.device}</span>}
            </button>
            {openId === d.id && <RecordView d={d} name={name} lensName={lensName} onClose={onClose} />}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        {filtered.length > shown && (
          <button onClick={() => setShown(shown + STEP)} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20">
            더 보기 ({filtered.length - shown}건 남음)
          </button>
        )}
        {filtered.length <= shown && hasMore && (
          <button onClick={() => void loadMore()} disabled={loading} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20 disabled:opacity-40">
            {loading ? "불러오는 중…" : "이전 기록 더 불러오기"}
          </button>
        )}
      </div>
    </section>
  );
}

function RecordView({ d, name, lensName, onClose }: { d: RecordDetail; name: (id: string) => string; lensName: (id: string) => string; onClose: () => void }) {
  const rows = useScorecard((s) => s.rows);
  const saveResponses = useScorecard((s) => s.saveResponses);
  const remove = useScorecard((s) => s.remove);
  const setDraft = useDraft((s) => s.set);
  const [note, setNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const responses = rows.find((r) => r.id === d.id)?.responses ?? {};

  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(null), 3000);
  };
  const saved = (r: "saved" | "queued") => flash(r === "saved" ? "저장됨" : "대기열에 저장");

  const rate = (kind: "best" | "fail", id: string) => {
    const cur = d.rating ?? emptyRating();
    const rating = kind === "best" ? toggleBest(cur, id) : toggleFail(cur, id);
    const next = withRating(responses, rating);
    // 방금 보낸 동시 전송이면 전송 바 위 평가 줄도 맞춘다
    const session = useSession.getState();
    if (session.lastBroadcast?.rowId === d.id) session.setLastBroadcast({ ...session.lastBroadcast, rating, row: next });
    void saveResponses(d.id, next).then(saved);
  };
  const judge = (serviceId: string, judged: Judged) => {
    const next = withJudged(responses, serviceId, judged);
    // 방금 실행한 파이프라인이면 요약 카드도 맞춘다
    const pr = usePipelineResult.getState().result;
    if (pr?.rowId === d.id)
      usePipelineResult.setState({ result: { ...pr, verifiers: pr.verifiers.map((v) => (v.serviceId === serviceId ? { ...v, verdict: { ...v.verdict, judged } } : v)) } });
    void saveResponses(d.id, next).then(saved);
  };
  const md = () => recordToMarkdown(d, name, lensName);
  const btn = "rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/10 hover:text-white/90";

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 px-3 py-3">
      <div className="flex flex-wrap items-center gap-1">
        <button className={btn} onClick={() => void copyText(md()).then((ok) => flash(ok ? "Markdown 복사됨" : "복사 실패"))}>
          Markdown 복사
        </button>
        <button
          className={btn}
          onClick={() =>
            void saveExport(md(), d.kind, Date.parse(d.at) || Date.now())
              .then((p) => flash(`저장: ${p.split("/").pop()}`))
              .catch((e) => flash(`저장 실패: ${String(e)}`))
          }
        >
          .md 저장
        </button>
        <button
          className={btn}
          title="이 프롬프트를 전송 바 입력창에 넣고 스테이지로 돌아갑니다 (자동으로 보내지 않음)"
          onClick={() => {
            setDraft(d.prompt);
            onClose();
          }}
        >
          입력창에 다시 넣기
        </button>
        {d.masked && <span className="text-xs text-amber-200/70">전송 전에 가린 기록입니다. 원래 값은 이 기록에 없습니다.</span>}
        {note && <span className="text-xs text-sky-300">{note}</span>}
        <span className="ml-auto">
          {confirmDelete ? (
            <span className="flex items-center gap-1 text-xs">
              <span className="text-rose-300">이 기록을 지울까요? 되돌릴 수 없습니다</span>
              <button className="rounded bg-rose-500/30 px-2 py-0.5 text-rose-100 hover:bg-rose-500/50" onClick={() => void remove(d.id)}>
                삭제
              </button>
              <button className={btn} onClick={() => setConfirmDelete(false)}>
                취소
              </button>
            </span>
          ) : (
            <button className="rounded px-2 py-0.5 text-xs text-rose-300/70 hover:bg-rose-500/15" onClick={() => setConfirmDelete(true)}>
              삭제
            </button>
          )}
        </span>
      </div>

      <Block title="질문" text={d.prompt} />

      {d.kind === "broadcast" &&
        d.answers.map((a) => {
          const best = d.rating?.best === a.serviceId;
          const fail = !!d.rating?.fail.includes(a.serviceId);
          return (
            <Block
              key={a.serviceId}
              title={name(a.serviceId)}
              text={a.text}
              extra={
                <span className="flex gap-1">
                  <button onClick={() => rate("best", a.serviceId)} className={"rounded px-1.5 text-xs " + (best ? "bg-amber-400/30 text-amber-100" : "text-white/40 hover:bg-white/10")} title="가장 좋은 답 (기록당 하나)">
                    ★ 최고
                  </button>
                  <button onClick={() => rate("fail", a.serviceId)} className={"rounded px-1.5 text-xs " + (fail ? "bg-rose-400/30 text-rose-100" : "text-white/40 hover:bg-white/10")} title="빈 응답·끊김·엉뚱한 답">
                    ✕ 실패
                  </button>
                </span>
              }
            />
          );
        })}

      {d.kind === "pipeline" && (
        <>
          {d.answers.map((a) => (
            <Block key={a.serviceId} title={`생성 — ${name(a.serviceId)}`} text={a.text} />
          ))}
          {d.verifiers.map((v) => (
            <Block
              key={v.serviceId}
              title={`검증 — ${name(v.serviceId)} · ${lensName(v.lens)}`}
              text={v.text}
              extra={
                <span className="flex items-center gap-1">
                  <span className={"rounded px-1.5 py-0.5 text-xs " + GRADE_CLASS[v.verdict?.grade ?? "unknown"]}>{GRADE_LABEL[v.verdict?.grade ?? "unknown"]}</span>
                  {v.verdict &&
                    JUDGE.map((j) => (
                      <button
                        key={j.key}
                        onClick={() => judge(v.serviceId, j.key)}
                        className={"rounded px-1.5 py-0.5 text-xs " + (v.verdict?.judged === j.key ? j.on : "bg-white/5 text-white/50 hover:bg-white/15")}
                      >
                        {j.label}
                      </button>
                    ))}
                </span>
              }
              head={
                v.verdict && (v.verdict.headline.length > 0 || v.verdict.confirmed) ? (
                  <div className="flex flex-col gap-0.5 text-xs">
                    {v.verdict.confirmed && <div className="text-emerald-200/80">확인됨: {v.verdict.confirmed}</div>}
                    {v.verdict.headline.map((h, i) => (
                      <div key={i} className="text-white/70">
                        · {h}
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
          ))}
          {d.revised && d.generator && <Block title={`수정본 — ${name(d.generator)}`} text={d.revised} />}
        </>
      )}
    </div>
  );
}

function Block({ title, text, extra, head }: { title: string; text: string; extra?: React.ReactNode; head?: React.ReactNode }) {
  const [full, setFull] = useState(false);
  const long = text.length > 600;
  return (
    <div className="flex flex-col gap-1 rounded border border-white/5 bg-black/20 p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-white/80">{title}</span>
        <span className="text-xs text-white/30">{text.length.toLocaleString()}자</span>
        <span className="ml-auto">{extra}</span>
      </div>
      {head}
      <div className={"whitespace-pre-wrap break-words text-xs text-white/70 " + (full ? "" : "max-h-40 overflow-hidden")}>{text.trim() || "(응답 없음)"}</div>
      {long && (
        <button onClick={() => setFull(!full)} className="self-start text-xs text-white/40 hover:text-white/80">
          {full ? "접기" : "전체 보기"}
        </button>
      )}
    </div>
  );
}
