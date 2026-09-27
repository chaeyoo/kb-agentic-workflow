// /internals 페이지용 API: "안에서 무슨 일이 일어나는지" 보여주기.
//   GET /internals/tools  에이전트가 실제로 받는 도구 목록(MCP listTools) + description v1/v2 원문 + read 토큰에 보이는 도구
//   GET /internals/stats  실행 수, 토큰 합계
import { Hono } from "hono";
import type { FileStore } from "@kb/core";
import { connectToolbox } from "../agent/mcpClient.ts";

export function internalsRoutes(store: FileStore) {
  const app = new Hono();

  app.get("/internals/tools", async (c) => {
    const mcpUrl = process.env.MCP_URL || "http://localhost:8788/mcp";
    const agentToken = process.env.MCP_AGENT_TOKEN || "";
    const readToken = (process.env.MCP_TOKENS || "").split(",").map((e) => e.trim().split(":"))
      .find(([, scope]) => scope === "read")?.[0];
    try {
      const agent = await connectToolbox({ token: agentToken });
      const reader = readToken ? await connectToolbox({ token: readToken }) : undefined;
      const meta = await fetch(new URL("/descriptions", mcpUrl), { headers: { Authorization: `Bearer ${agentToken}` } })
        .then((r) => r.json() as Promise<{ current: string; versions: Record<string, Record<string, string>>; tools: { name: string; scope: string; requiresApproval: boolean; readOnly: boolean }[] }>);
      const result = {
        mcpUrl,
        descriptionVersion: meta.current,
        tools: agent.tools.map((t) => ({
          ...meta.tools.find((m) => m.name === t.name),
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
          visibleToReadToken: reader?.tools.some((r) => r.name === t.name) ?? false,
        })),
        descriptions: meta.versions,
      };
      await agent.close();
      await reader?.close();
      return c.json(result);
    } catch (err) {
      return c.json({ error: `MCP 서버에 연결할 수 없습니다: ${(err as Error).message}` }, 502);
    }
  });

  app.get("/internals/stats", (c) => {
    const runs = store.data.runs;
    const sum = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0);
    return c.json({
      runs: runs.length,
      failed: runs.filter((r) => r.status === "failed").length,
      inputTokens: sum((r) => r.tokenUsage.inputTokens),
      cacheReadTokens: sum((r) => r.tokenUsage.cacheReadTokens),
      outputTokens: sum((r) => r.tokenUsage.outputTokens),
      toolCalls: sum((r) => r.events.filter((e) => e.type === "tool_call").length),
    });
  });

  return app;
}
