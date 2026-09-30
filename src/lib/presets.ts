import type { ServiceDef } from "../adapters";
import { COMPOSITE_LENS_ID } from "./lenses";
import { pipelineCandidates, type RoleMap } from "./roles";

/**
 * 검토 프리셋 (docs/verification-lens-design-2026-09-30.md §4): 검증 슬롯 = 렌즈 + 선호 서비스 순서.
 * 적용하면 스테이지의 AI 패널(생성 제외)에 선호 순으로 배정한다. 생성 패널은 바꾸지 않는다.
 */
export interface PresetSlot {
  lens: string;
  /** 선호 서비스 id, 앞이 우선. 없으면 남은 패널 아무거나 */
  prefer: string[];
}
export interface Preset {
  id: string;
  name: string;
  description: string;
  slots: PresetSlot[];
  defaultDepth: Depth;
}

export type Depth = "quick" | "standard" | "deep";
export const DEPTHS: { id: Depth; label: string; maxVerifiers: number; lengthHint: string }[] = [
  { id: "quick", label: "빠름", maxVerifiers: 1, lengthHint: "판정 블록 앞의 검토 내용은 5줄 이내로만 쓰세요." },
  { id: "standard", label: "표준", maxVerifiers: 3, lengthHint: "판정 블록 앞의 검토 내용은 15줄 이내로 쓰세요." },
  { id: "deep", label: "심층", maxVerifiers: Infinity, lengthHint: "" },
];
export const depthOf = (id: string | undefined): (typeof DEPTHS)[number] => DEPTHS.find((d) => d.id === id) ?? DEPTHS[1];

const SEARCH = ["perplexity", "grok", "chatgpt"];
const REASON = ["claude", "gemini"];

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "report",
    name: "보고서·문서",
    description: "사실(검색 가능 서비스) → 논리 → 위험. 흰 모자 1차 필터 → SIFT → Paul-Elder 3 → 검은 모자",
    slots: [
      { lens: "fact", prefer: SEARCH },
      { lens: "logic", prefer: ["claude", "gemini"] },
      { lens: "risk", prefer: ["gemini", "claude"] },
    ],
    defaultDepth: "standard",
  },
  {
    id: "idea",
    name: "아이디어·기획",
    description: "강점 → 위험 → 개선. 긍정 먼저, 그다음 부정, 마지막 대안",
    slots: [
      { lens: "strength", prefer: ["gemini", "chatgpt"] },
      { lens: "risk", prefer: ["claude", "gemini"] },
      { lens: "improve", prefer: ["chatgpt", "gemini"] },
    ],
    defaultDepth: "standard",
  },
  {
    id: "code",
    name: "코드",
    description: "코드 4레이어(두 모델이 각각) → 위험. 한 번에 한 레이어",
    slots: [
      { lens: "code", prefer: ["claude", "chatgpt"] },
      { lens: "code", prefer: ["chatgpt", "claude"] },
      { lens: "risk", prefer: ["gemini", "claude"] },
    ],
    defaultDepth: "standard",
  },
  {
    id: "quick",
    name: "빠른 검토",
    description: "위험 렌즈 하나만. 1~3분짜리 단순 산출물",
    slots: [{ lens: "risk", prefer: REASON }],
    defaultDepth: "quick",
  },
  {
    id: "opinion",
    name: "결론·추천 검토",
    description: "사실 → 편향(RAVEN). 보고서의 결론·추천 부분",
    slots: [
      { lens: "fact", prefer: SEARCH },
      { lens: "bias", prefer: ["claude", "gemini"] },
    ],
    defaultDepth: "standard",
  },
];
export const findPreset = (id: string | undefined) => BUILTIN_PRESETS.find((p) => p.id === id);

/** 요약 카드 표시 순서: 긍정 → 사실 → 추론 → 부정 → 개선 → 코드 → 편향 → 종합 (설계 §4) */
export const LENS_ORDER = ["strength", "fact", "logic", "risk", "improve", "code", "bias", COMPOSITE_LENS_ID];
const rank = (lens: string) => {
  const i = LENS_ORDER.indexOf(lens);
  return i < 0 ? LENS_ORDER.length : i;
};
export const sortByLensOrder = <T>(items: T[], lensOf: (t: T) => string): T[] =>
  items.map((t, i) => ({ t, i })).sort((a, b) => rank(lensOf(a.t)) - rank(lensOf(b.t)) || a.i - b.i).map((x) => x.t);

export interface PresetApplication {
  roles: RoleMap;
  lensAssign: Record<string, string>;
  /** 슬롯 순서대로 배정된 검증 패널 id */
  assigned: string[];
  /** 배정되지 않아 제외된 AI 패널 id */
  leftover: string[];
  generator: string | null;
}

/**
 * 프리셋 배정 규칙:
 * - 생성 패널은 인자로 받은 것을 유지(없으면 첫 AI 패널)
 * - 슬롯마다 선호 서비스 중 스테이지에 있고 아직 안 쓴 첫 패널, 없으면 남은 패널 중 첫 번째
 * - 슬롯보다 패널이 적으면 남는 슬롯은 비우고, 패널이 많으면 남는 패널은 제외
 */
export function applyPreset(preset: Preset, stage: string[], services: ServiceDef[], generatorId: string | null): PresetApplication {
  const candidates = pipelineCandidates(stage, services).map((s) => s.id);
  const generator = generatorId && candidates.includes(generatorId) ? generatorId : (candidates[0] ?? null);
  const pool = candidates.filter((id) => id !== generator);
  const assigned: string[] = [];
  const lensAssign: Record<string, string> = {};
  for (const slot of preset.slots) {
    const pick = slot.prefer.find((id) => pool.includes(id)) ?? pool[0];
    if (!pick) break;
    pool.splice(pool.indexOf(pick), 1);
    assigned.push(pick);
    lensAssign[pick] = slot.lens;
  }
  const roles: RoleMap = {};
  if (generator) roles[generator] = "generate";
  for (const id of assigned) roles[id] = "verify";
  for (const id of pool) roles[id] = "off";
  return { roles, lensAssign, assigned, leftover: pool, generator };
}

/**
 * 깊이 상한으로 검증 패널을 자른다. 우선순위: preferredOrder(프리셋 슬롯 순서)에 있는 것 먼저, 그다음 원래 순서.
 */
export function limitByDepth<T>(verifiers: T[], depth: Depth, idOf: (t: T) => string, preferredOrder: string[] = []): T[] {
  const max = depthOf(depth).maxVerifiers;
  if (verifiers.length <= max) return verifiers;
  const pos = (t: T) => {
    const i = preferredOrder.indexOf(idOf(t));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return verifiers
    .map((t, i) => ({ t, i }))
    .sort((a, b) => pos(a.t) - pos(b.t) || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.t);
}
