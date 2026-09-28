import type { z } from "zod";
import type { Caller, Scope } from "../auth.ts";

/**
 * 도구 정의 한 개.
 * - description 은 여기 없다. descriptions/v1.ts, v2.ts 에서 이름으로 찾아 붙인다 (버전 교체 실험용).
 * - requiresApproval: 이 도구의 결과가 사람 승인 후에야 반영되는가. 클라이언트에 _meta 로 전달된다.
 *   승인 여부를 코드에 하드코딩하지 않고, 도구 정의의 설정값으로 관리한다.
 */
export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  scope: Scope; // 이 도구를 쓰려면 필요한 권한
  requiresApproval: boolean;
  readOnly: boolean;
  input: Shape;
  handler: (args: z.infer<z.ZodObject<Shape>>, caller: Caller) => Promise<unknown>;
}

export function defineTool<Shape extends z.ZodRawShape>(def: ToolDef<Shape>): ToolDef {
  return def as unknown as ToolDef;
}
