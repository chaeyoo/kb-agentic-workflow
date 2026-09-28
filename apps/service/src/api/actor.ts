// 누가 요청했는가. 로그인이 없으므로 헤더로 전달한다.
//   웹 UI : x-actor = encodeURIComponent('{"kind":"user","name":"김하늘"}')
//   mcp   : x-actor = encodeURIComponent('{"kind":"agent","runId":"run-3"}')  (에이전트 토큰으로 온 호출)
// 데모용이다. 실제 서비스라면 인증 토큰에서 호출자를 꺼내야 한다.
import type { Context } from "hono";
import type { Comment } from "@kb/core";

export type Actor = Comment["author"];

export function actorOf(c: Context): Actor {
  const raw = c.req.header("x-actor");
  if (raw) {
    try {
      const a = JSON.parse(decodeURIComponent(raw)) as Actor;
      if (a.kind === "agent") return { kind: "agent", runId: a.runId };
      if (a.kind === "user" && a.name) return { kind: "user", name: a.name };
    } catch { /* 형식이 틀리면 익명 */ }
  }
  return { kind: "user", name: "익명" };
}

export const actorName = (a: Actor) => (a.kind === "agent" ? "agent" : a.name);
