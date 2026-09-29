import { isBroadcastTarget, type ServiceDef } from "../adapters";

/** 파이프라인 모드에서 패널이 맡는 역할 */
export type PanelRole = "generate" | "verify" | "off";
/** 전송 모드: 동시 전송(기존) / 생성→검증 파이프라인 */
export type SendMode = "broadcast" | "pipeline";
export type RoleMap = Record<string, PanelRole>;

export interface PipelineRoles {
  generator: ServiceDef | null;
  verifiers: ServiceDef[];
  /** 실행 불가 사유 (없으면 실행 가능) */
  error?: string;
}

/** 스테이지에 올라온 AI 패널만 (웹슬롯 제외) */
export const pipelineCandidates = (stage: string[], services: ServiceDef[]) =>
  stage.map((id) => services.find((s) => s.id === id)).filter((s): s is ServiceDef => !!s && isBroadcastTarget(s));

/**
 * 역할 해석 규칙:
 * - 아무 역할도 지정되지 않았으면 첫 AI 패널이 생성, 나머지가 검증
 * - 하나라도 지정됐으면 미지정 패널은 검증으로 본다
 * - 생성은 정확히 1개, 검증은 1개 이상이어야 실행 가능
 */
export function resolvePipelineRoles(stage: string[], roles: RoleMap, services: ServiceDef[]): PipelineRoles {
  const candidates = pipelineCandidates(stage, services);
  const explicit = candidates.some((c) => roles[c.id]);
  if (!explicit) {
    const [generator = null, ...verifiers] = candidates;
    return { generator, verifiers, error: !generator ? "AI 패널이 없습니다" : verifiers.length === 0 ? "검증 패널이 없습니다" : undefined };
  }
  const gens = candidates.filter((c) => roles[c.id] === "generate");
  const verifiers = candidates.filter((c) => (roles[c.id] ?? "verify") === "verify");
  const error =
    gens.length === 0 ? "생성 패널을 지정하세요" : gens.length > 1 ? "생성 패널은 1개만" : verifiers.length === 0 ? "검증 패널이 없습니다" : undefined;
  return { generator: gens.length === 1 ? gens[0] : null, verifiers, error };
}

/** 패널의 현재(암묵 포함) 역할 */
export function effectiveRole(id: string, resolved: PipelineRoles): PanelRole {
  if (resolved.generator?.id === id) return "generate";
  if (resolved.verifiers.some((v) => v.id === id)) return "verify";
  return "off";
}

/** 생성 → 검증 → 제외 → 생성 순환 */
export const nextRole = (r: PanelRole): PanelRole => (r === "generate" ? "verify" : r === "verify" ? "off" : "generate");

/**
 * 역할 배정. 암묵 상태였다면 먼저 현재 역할을 전부 명시로 굳혀 다른 패널이 뒤바뀌지 않게 하고,
 * 새 생성 패널을 지정하면 기존 생성 패널은 검증으로 내린다 (생성은 항상 1개).
 */
export function assignRole(roles: RoleMap, stage: string[], services: ServiceDef[], id: string, role: PanelRole): RoleMap {
  const resolved = resolvePipelineRoles(stage, roles, services);
  const next: RoleMap = { ...roles };
  for (const c of pipelineCandidates(stage, services)) if (!next[c.id]) next[c.id] = effectiveRole(c.id, resolved);
  if (role === "generate") for (const k of Object.keys(next)) if (next[k] === "generate") next[k] = "verify";
  next[id] = role;
  return next;
}
