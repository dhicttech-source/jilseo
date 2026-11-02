import { useState } from "react";
import { isSaved, saveLabel } from "../lib/localRecords";
import { useSession } from "../store/session";
import { useStage } from "../store/stage";

/**
 * 동시 전송이 끝난 뒤 전송 바 위에 뜨는 평가 줄. 서비스마다 ★ 최고(1개) / ✕ 실패(여러 개)를 누르면
 * 같은 비교 기록의 `_rating`에 저장되고(이 기기 파일 → 연결돼 있으면 Supabase), 성적표 집계 탭의 "동시 전송" 표에 쌓인다.
 */
export function BroadcastRating() {
  const last = useSession((s) => s.lastBroadcast);
  const rate = useSession((s) => s.rateLast);
  const services = useStage((s) => s.services);
  const mode = useStage((s) => s.mode);
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!last || mode === "pipeline" || hiddenAt === last.at) return null;
  const ids = Object.keys(last.responses);
  if (ids.length === 0) return null;
  const name = (id: string) => services.find((x) => x.id === id)?.name ?? id;
  const savable = isSaved(last.saved);
  const rating = last.rating ?? { best: null, fail: [] };

  const click = (kind: "best" | "fail", id: string) =>
    void rate(kind, id).then((r) => {
      setNote(r === "queued" ? saveLabel(r) : null);
    });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/60">
      <span className="font-medium text-white/80" title="가장 좋았던 답에 ★, 비었거나 끊기거나 엉뚱한 답에 ✕. 성적표의 동시 전송 표에 쌓입니다">
        응답 평가
      </span>
      {ids.map((id) => {
        const best = rating.best === id;
        const fail = rating.fail.includes(id);
        const empty = !last.responses[id]?.trim();
        return (
          <span key={id} className="flex items-center gap-0.5 rounded border border-white/10 px-1.5 py-0.5">
            <span className={best ? "text-amber-200" : fail ? "text-rose-300/80 line-through" : "text-white/70"}>
              {name(id)}
              {empty && <span className="ml-1 text-white/35">(빈 응답)</span>}
            </span>
            <button
              disabled={!savable}
              onClick={() => click("best", id)}
              className={"rounded px-1 " + (best ? "bg-amber-400/30 text-amber-100" : "text-white/40 hover:bg-white/10 hover:text-amber-200") + " disabled:opacity-30"}
              title="가장 좋은 답 (기록당 하나)"
            >
              ★
            </button>
            <button
              disabled={!savable}
              onClick={() => click("fail", id)}
              className={"rounded px-1 " + (fail ? "bg-rose-400/30 text-rose-100" : "text-white/40 hover:bg-white/10 hover:text-rose-200") + " disabled:opacity-30"}
              title="실패: 빈 응답·끊김·엉뚱한 답"
            >
              ✕
            </button>
          </span>
        );
      })}
      {!savable && <span className="text-white/40">{last.ephemeral ? "🔒 임시 전송은 기록이 없어 평가를 저장하지 않습니다" : "기록이 저장되지 않아 평가할 수 없습니다"}</span>}
      {note && <span className="text-sky-300">{note}</span>}
      <button onClick={() => setHiddenAt(last.at)} className="ml-auto rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80" title="이번 결과의 평가 줄 닫기">
        닫기
      </button>
    </div>
  );
}
