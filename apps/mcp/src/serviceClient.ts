// service 서버 REST API 호출. mcp 서버는 상태를 갖지 않는 얇은 계층이다.
import type { Caller } from "./auth.ts";

const base = () => process.env.SERVICE_URL || `http://localhost:${process.env.SERVICE_PORT || 8787}`;

export class ServiceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** 쓰기 요청에 "누가" 했는지 싣는다. propose 토큰 = 에이전트, 그 외 = 토큰 이름 */
function actorHeader(caller?: Caller): Record<string, string> {
  if (!caller) return {};
  const actor = caller.scope === "propose"
    ? { kind: "agent", runId: caller.runId }
    : { kind: "user", name: caller.label };
  return { "x-actor": encodeURIComponent(JSON.stringify(actor)) };
}

async function request<T>(method: string, path: string, body?: unknown, caller?: Caller): Promise<T> {
  const res = await fetch(`${base()}/api${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...actorHeader(caller) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* 텍스트 그대로 */ }
    throw new ServiceError(res.status, msg);
  }
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? JSON.parse(text) : text) as T;
}

export const service = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown, caller: Caller) => request<T>("POST", path, body, caller),
  patch: <T>(path: string, body: unknown, caller: Caller) => request<T>("PATCH", path, body, caller),
};
