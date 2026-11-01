import { useEffect, useState } from "react";
import { BUILTIN_LENSES, GRADE_LABEL } from "../lib/lenses";
import { LENS_ORDER } from "../lib/presets";
import { emptyFilter, type RecordFilter } from "../lib/records";
import type { CellStat } from "../lib/scorecard";
import { useScorecard } from "../store/scorecard";
import { useStage } from "../store/stage";
import { ScorecardRecords } from "./ScorecardRecords";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function Cell({ c, onOpen }: { c: CellStat | undefined; onOpen: () => void }) {
  if (!c) return <td className="px-2 py-1.5 text-center text-white/20">·</td>;
  const judged = c.right + c.wrong;
  const title = `실행 ${c.runs} · 형식 준수 ${c.parsed}/${c.runs}\n등급: ${Object.entries(c.grades)
    .filter(([, n]) => n)
    .map(([g, n]) => `${GRADE_LABEL[g as keyof typeof GRADE_LABEL]} ${n}`)
    .join(", ")}\n채택: 맞음 ${c.right} · 틀림 ${c.wrong} · 보류 ${c.hold}\n누르면 이 기록들을 봅니다`;
  return (
    <td className="cursor-pointer px-2 py-1.5 text-center align-top hover:bg-white/5" title={title} onClick={onOpen}>
      <div className={"text-sm font-medium " + (c.accuracy === null ? "text-white/40" : c.accuracy >= 0.7 ? "text-emerald-300" : c.accuracy >= 0.4 ? "text-amber-200" : "text-rose-300")}>
        {pct(c.accuracy)}
        {judged > 0 && <span className="ml-1 text-xs font-normal text-white/40">({judged})</span>}
      </div>
      <div className="text-xs text-white/45">
        {c.runs}회 · 심각 {c.runs ? (c.severeSum / c.runs).toFixed(1) : "0"}
      </div>
    </td>
  );
}

type Tab = "summary" | "records";

/**
 * 성적표 (설계 §9 D): 렌즈×검증 모델의 "맞는 지적 비율"(사람이 채택한 것만)과 실행 수·평균 심각 지적,
 * 생성 모델별 신뢰 비율, 동시 전송 응답 평가(★/✕). 추천의 데이터 원천이며, 자동 라우팅은 하지 않는다.
 * 기록 탭은 같은 조회 결과로 지난 비교를 찾고 평가·채택을 고친다. 집계 칸을 누르면 그 칸의 기록으로 넘어간다.
 */
export function Scorecard({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [filter, setFilter] = useState<RecordFilter>(emptyFilter);
  const rows = useScorecard((s) => s.rows);
  const card = useScorecard((s) => s.card);
  const loading = useScorecard((s) => s.loading);
  const message = useScorecard((s) => s.message);
  const loadedAt = useScorecard((s) => s.loadedAt);
  const load = useScorecard((s) => s.load);
  const services = useStage((s) => s.services);
  const customLenses = useStage((s) => s.customLenses);
  useEffect(() => {
    if (!card && !loading) void load();
  }, [card, loading, load]);

  const name = (id: string) => services.find((x) => x.id === id)?.name ?? id;
  const allLenses = [...BUILTIN_LENSES, ...customLenses];
  const lensName = (id: string) => {
    const l = allLenses.find((x) => x.id === id);
    return l ? `${l.icon} ${l.name}` : id;
  };
  const lensIds = card ? Object.keys(card.byLensModel).sort((a, b) => (LENS_ORDER.indexOf(a) + 100) % 100 - ((LENS_ORDER.indexOf(b) + 100) % 100)) : [];
  const models = card ? [...new Set(Object.values(card.byLensModel).flatMap((m) => Object.keys(m)))] : [];
  const bcast = card?.broadcast;
  const open = (f: Partial<RecordFilter>) => {
    setFilter({ ...emptyFilter(), ...f });
    setTab("records");
  };
  const tabClass = (t: Tab) => "rounded px-3 py-1 text-xs " + (tab === t ? "bg-white/15 text-white/90" : "text-white/55 hover:bg-white/10 hover:text-white/90");

  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-4xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium text-white/90">성적표</h1>
          <span className="flex gap-1">
            <button className={tabClass("summary")} onClick={() => setTab("summary")}>
              집계
            </button>
            <button className={tabClass("records")} onClick={() => setTab("records")} title="지난 비교 찾기 · 평가·채택 수정 · 내보내기">
              기록 {rows.length ? rows.length : ""}
            </button>
          </span>
          <span className="text-xs text-white/40">
            {card ? `파이프라인 ${card.rows}건 · 동시 전송 ${card.broadcast.rows}건(평가 ${card.broadcast.rated})` : ""}
            {loadedAt ? ` · ${new Date(loadedAt).toLocaleTimeString()} 조회` : ""}
          </span>
          <button onClick={() => void load()} disabled={loading} className="rounded bg-white/10 px-3 py-1 text-xs text-white/80 disabled:opacity-40">
            {loading ? "조회 중…" : "새로고침"}
          </button>
          <button onClick={onClose} className="ml-auto rounded bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-white/20">
            스테이지로 돌아가기
          </button>
        </div>
        {message && <div className="text-xs text-amber-300">{message}</div>}

        {tab === "records" && <ScorecardRecords filter={filter} setFilter={setFilter} onClose={onClose} />}

        {tab === "summary" && card && card.rows > 0 && (
          <>
            <p className="text-xs text-white/40">
              파이프라인 기록 기간 {dateOnly(card.from)} ~ {dateOnly(card.to)}. 칸이나 행을 누르면 그 집계에 들어간 기록을 기록 탭에서 봅니다.
            </p>
            <section className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
              <h2 className="text-sm font-medium text-white/85">렌즈 × 검증 모델 — 맞는 지적 비율</h2>
              <p className="text-xs text-white/40">
                비율 = 맞음 ÷ (맞음 + 틀림), 요약 카드에서 채택한 판정만 셉니다. 괄호는 채택 건수, 아래 줄은 실행 수와 평균 심각 지적 수. 채택이 없으면 "–".
              </p>
              <table className="text-sm text-white/80">
                <thead>
                  <tr className="text-xs text-white/50">
                    <th className="px-2 py-1 text-left">렌즈</th>
                    {models.map((m) => (
                      <th key={m} className="px-2 py-1">{name(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lensIds.map((lens) => (
                    <tr key={lens} className="border-t border-white/5">
                      <td className="px-2 py-1.5 text-left text-white/70">{lensName(lens)}</td>
                      {models.map((m) => (
                        <Cell key={m} c={card.byLensModel[lens]?.[m]} onOpen={() => open({ kind: "pipeline", service: m, lens })} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
              <h2 className="text-sm font-medium text-white/85">생성 모델 — 검증자들이 신뢰한 비율</h2>
              <p className="text-xs text-white/40">신뢰 비율 = "신뢰 가능" 판정 ÷ 형식이 읽힌 판정. 검증 모델의 성향이 섞여 있으므로 참고용입니다.</p>
              <table className="text-sm text-white/80">
                <thead>
                  <tr className="text-xs text-white/50">
                    <th className="px-2 py-1 text-left">생성 모델</th>
                    <th className="px-2 py-1">실행</th>
                    <th className="px-2 py-1">신뢰 비율</th>
                    <th className="px-2 py-1">판정 수</th>
                    <th className="px-2 py-1">수정 단계</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(card.byGenerator).map(([g, st]) => (
                    <tr key={g} className="cursor-pointer border-t border-white/5 text-center hover:bg-white/5" onClick={() => open({ kind: "pipeline", generator: g })} title="이 서비스가 생성한 기록 보기">
                      <td className="px-2 py-1.5 text-left">{name(g)}</td>
                      <td className="px-2 py-1.5">{st.runs}</td>
                      <td className="px-2 py-1.5">{pct(st.trustRate)}</td>
                      <td className="px-2 py-1.5">{st.totalVotes}</td>
                      <td className="px-2 py-1.5">{st.revised}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <p className="text-xs text-white/35">
              전송 바에서 프리셋을 고르면 이 표를 근거로 배정을 제안합니다(채택 3건 이상인 모델만). 제안일 뿐 클릭해야 반영됩니다.
            </p>
          </>
        )}

        {tab === "summary" && bcast && bcast.rows > 0 && (
          <section className="flex flex-col gap-2 rounded-lg border border-white/10 p-4">
            <h2 className="text-sm font-medium text-white/85">동시 전송 — 응답 평가</h2>
            <p className="text-xs text-white/40">
              동시 전송 뒤 전송 바 위의 "응답 평가"에서 누른 ★ 최고 / ✕ 실패를 셉니다. 비율의 분모는 평가한 기록 수. 평가는 기록 탭에서도 고칠 수 있습니다.
            </p>
            <table className="text-sm text-white/80">
              <thead>
                <tr className="text-xs text-white/50">
                  <th className="px-2 py-1 text-left">서비스</th>
                  <th className="px-2 py-1">응답</th>
                  <th className="px-2 py-1">평가</th>
                  <th className="px-2 py-1">★ 최고</th>
                  <th className="px-2 py-1">✕ 실패</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bcast.byService)
                  .sort((a, b) => (b[1].bestRate ?? -1) - (a[1].bestRate ?? -1) || b[1].runs - a[1].runs)
                  .map(([id, st]) => (
                    <tr key={id} className="cursor-pointer border-t border-white/5 text-center hover:bg-white/5" onClick={() => open({ kind: "broadcast", service: id })} title="이 서비스가 응답한 동시 전송 기록 보기">
                      <td className="px-2 py-1.5 text-left">{name(id)}</td>
                      <td className="px-2 py-1.5">{st.runs}</td>
                      <td className="px-2 py-1.5">{st.rated}</td>
                      <td className="px-2 py-1.5 text-amber-200">
                        {pct(st.bestRate)} <span className="text-xs text-white/40">({st.best})</span>
                      </td>
                      <td className="px-2 py-1.5 text-rose-300">
                        {pct(st.failRate)} <span className="text-xs text-white/40">({st.fail})</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {bcast.rated === 0 && <p className="text-xs text-white/35">아직 평가한 동시 전송이 없습니다.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
