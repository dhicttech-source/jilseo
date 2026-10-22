import { useMemo, useState } from "react";
import { addManualGroup, applyMask, type PiiGroup } from "../lib/pii/mask";
import { KIND_LABEL } from "../lib/pii/patterns";
import { SOURCE_LABEL, attachmentUnreadable, type AttachmentChoice, type PreparedSend } from "../lib/pii/prepare";
import { useStage } from "../store/stage";

export interface ReviewState {
  prep: PreparedSend;
  groups: PiiGroup[];
  choice: AttachmentChoice;
}

const KIND_LABEL_ATT: Record<string, string> = { text: "텍스트", docx: "Word", pptx: "PowerPoint", xlsx: "Excel", pdf: "PDF", unsupported: "읽을 수 없는 형식" };

/**
 * 전송 전 비식별화 검토 패널. 전송 바 위에 펼쳐진다(웹뷰 위 오버레이 불가).
 * 같은 원문은 한 줄로 묶어 "프롬프트 2 · 첨부 14"처럼 보여 주고, 체크한 것만 기호로 바꿔 보낸다.
 */
export function PiiReview({
  state,
  onChange,
  onConfirm,
  onSendOriginal,
  onCancel,
  getSelectedText,
}: {
  state: ReviewState;
  onChange(s: ReviewState): void;
  onConfirm(): void;
  onSendOriginal(): void;
  onCancel(): void;
  getSelectedText(): string;
}) {
  const allowPiiWord = useStage((s) => s.allowPiiWord);
  const [manual, setManual] = useState("");
  const { prep, groups, choice } = state;
  const unreadable = attachmentUnreadable(prep);
  const checkedCount = groups.filter((g) => g.checked).length;
  const preview = useMemo(() => applyMask(prep.sources.filter((s) => s.id === "prompt"), groups).texts.prompt ?? "", [prep, groups]);

  const setGroups = (next: PiiGroup[]) => onChange({ ...state, groups: next });
  const toggle = (key: string) => setGroups(groups.map((g) => (g.key === key ? { ...g, checked: !g.checked } : g)));
  const addWord = (w: string) => {
    if (w.trim().length < 2) return;
    setGroups(addManualGroup(groups, prep.sources, w));
    setManual("");
  };
  const allowAlways = (g: PiiGroup) => {
    allowPiiWord(g.original);
    setGroups(groups.map((x) => (x.key === g.key ? { ...x, checked: false } : x)));
  };
  const countText = (g: PiiGroup) =>
    Object.entries(g.counts)
      .map(([src, n]) => `${SOURCE_LABEL[src] ?? src} ${n}`)
      .join(" · ") || "직접 추가";

  return (
    <div className="flex max-h-80 flex-col gap-2 border-b border-amber-400/30 bg-amber-400/[0.04] px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-amber-200">전송 전 비식별화 검토</span>
        <span className="text-white/50">
          {groups.length ? `후보 ${groups.length}개 중 ${checkedCount}개를 가립니다` : "탐지된 개인정보·기관명 없음"}
          {" · "}체크한 항목만 기호로 바뀌어 전송되고, 원래 값은 이 기기에만 남습니다
        </span>
        <button
          onClick={() => setGroups(groups.map((g) => ({ ...g, checked: checkedCount !== groups.length })))}
          className="ml-auto rounded px-2 py-0.5 text-white/60 hover:bg-white/10"
          disabled={!groups.length}
        >
          {checkedCount === groups.length ? "모두 해제" : "모두 선택"}
        </button>
      </div>

      {prep.attachment && (
        <div className={"flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 " + (unreadable ? "border-rose-400/40 bg-rose-400/[0.06]" : "border-white/10")}>
          <span className="text-white/80">📎 {prep.attachment.name}</span>
          <span className="rounded bg-white/10 px-1.5 text-white/60">{KIND_LABEL_ATT[prep.extracted?.kind ?? "unsupported"]}</span>
          {prep.extracted?.note && <span className={unreadable ? "text-rose-200" : "text-white/50"}>{prep.extracted.note}</span>}
          {prep.extracted?.truncated && <span className="text-amber-200">일부 생략</span>}
          <span className="ml-auto flex gap-1">
            {(unreadable ? (["remove", "original"] as const) : (["masked", "original", "remove"] as const)).map((c) => (
              <button
                key={c}
                onClick={() => onChange({ ...state, choice: c })}
                className={"rounded px-2 py-0.5 " + (choice === c ? "bg-white/20 text-white/90" : "text-white/50 hover:bg-white/10")}
              >
                {c === "masked" ? (prep.extracted?.converted ? "가린 텍스트로 변환해 보내기" : "가려서 보내기") : c === "original" ? "원본 그대로" : "첨부 빼기"}
              </button>
            ))}
          </span>
          {choice === "original" && <span className="w-full text-rose-200">원본 첨부는 내용이 그대로 전송됩니다. 아래 체크는 프롬프트에만 적용됩니다.</span>}
        </div>
      )}

      {groups.length > 0 && (
        <div className="min-h-0 overflow-y-auto rounded border border-white/10">
          <table className="w-full">
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className={"border-b border-white/5 " + (g.checked ? "" : "opacity-50")}>
                  <td className="w-6 px-2 py-1">
                    <input type="checkbox" checked={g.checked} onChange={() => toggle(g.key)} />
                  </td>
                  <td className="w-20 py-1">
                    <span className="rounded bg-white/10 px-1.5 text-white/70">{KIND_LABEL[g.kind]}</span>
                    {g.confidence === "medium" && <span className="ml-1 text-white/35" title="이름·기관·주소는 규칙으로 추정한 것입니다. 확인해 주세요">추정</span>}
                  </td>
                  <td className="max-w-64 truncate py-1 text-white/90" title={g.original}>{g.original}</td>
                  <td className="py-1 text-sky-200">→ {g.token}</td>
                  <td className="py-1 text-white/45">{countText(g)}</td>
                  <td className="py-1 pr-2 text-right">
                    {g.kind !== "custom" && (
                      <button onClick={() => allowAlways(g)} className="rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80" title="이 단어는 앞으로 가리지 않습니다 (설정 → 비식별화에서 되돌릴 수 있음)">
                        항상 허용
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addWord(manual)}
          placeholder="놓친 단어 직접 추가 (2글자 이상)"
          className="w-56 rounded border border-white/15 bg-white/5 px-2 py-1 text-white/90 outline-none"
        />
        <button onClick={() => addWord(manual)} className="rounded bg-white/10 px-2 py-1 text-white/80 hover:bg-white/20">
          추가
        </button>
        <button onClick={() => addWord(getSelectedText())} className="rounded px-2 py-1 text-white/60 hover:bg-white/10" title="입력창에서 드래그해 선택한 글자를 가림 목록에 추가">
          입력창 선택 추가
        </button>
        <span className="min-w-0 flex-1 truncate text-white/40" title={preview}>
          보낼 프롬프트: {preview.slice(0, 160)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onConfirm} className="rounded bg-amber-300 px-3 py-1 font-medium text-black hover:bg-amber-200">
          {checkedCount || choice !== "original" ? "가린 채로 보내기" : "보내기"}
        </button>
        <button onClick={onSendOriginal} className="rounded px-3 py-1 text-white/70 hover:bg-white/10" title="아무것도 가리지 않고 원문과 원본 첨부를 그대로 보냅니다">
          원문 그대로 보내기
        </button>
        <button onClick={onCancel} className="rounded px-3 py-1 text-white/50 hover:bg-white/10">
          취소
        </button>
        <span className="ml-auto text-white/35">규칙 기반 탐지라 호칭 없는 이름·외국인 이름은 놓칠 수 있습니다</span>
      </div>
    </div>
  );
}
