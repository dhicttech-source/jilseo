import { z } from "zod";
import type { ServiceDef } from "../adapters";

/**
 * services/*.json 검증 (LibreChat의 data-schemas처럼 설정을 스키마로 잡는다).
 * 앱 시작 시 잘못된 정의는 제외하고 사유를 헤더 "서비스 정의 오류"에 보여 주며,
 * vitest(serviceSchema.test.ts)가 저장소의 JSON 전부를 같은 스키마로 검사해 기여자의 PR 실수를 잡는다.
 */
const selector = z.string().trim().min(1, "빈 셀렉터");

export const serviceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "id는 소문자·숫자·하이픈"),
    name: z.string().trim().min(1),
    url: z.string().url().refine((u) => u.startsWith("https://"), "https URL만"),
    partition: z.string().regex(/^persist:[a-z0-9-]+$/, "partition은 persist:<id>"),
    selectors: z
      .object({
        input: selector,
        send: selector,
        response: selector,
        fileInput: selector.optional(),
        fileMenu: selector.optional(),
        generating: selector.optional(),
      })
      .strict(),
    verified: z.string().optional(),
    kind: z.enum(["ai", "web"]).optional(),
    afterFileBroadcast: z.literal("new_chat").optional(),
  })
  .strict();

export type ServiceInput = z.input<typeof serviceSchema>;

/** 검증 결과: 통과한 정의와 "파일/필드 — 사유" 오류 목록 */
export function validateServices(items: unknown[], labelOf: (item: unknown, index: number) => string = (_, i) => `#${i + 1}`) {
  const services: ServiceDef[] = [];
  const errors: string[] = [];
  items.forEach((item, i) => {
    const r = serviceSchema.safeParse(item);
    if (r.success) services.push(r.data as ServiceDef);
    else
      for (const issue of r.error.issues) errors.push(`${labelOf(item, i)}: ${issue.path.join(".") || "(root)"} — ${issue.message}`);
  });
  return { services, errors };
}
