// MCP 서버: 원격 MCP (Streamable HTTP) + Bearer 토큰 인증.
//
// 우리 정책 에이전트와 외주 개발자의 AI 코딩 도구가 "같은" 이 서버에 붙는다.
// 상태는 service 서버에 있고, 여기는 도구 정의(이름/설명/입력 스키마/권한)와 호출 전달만 한다.
//
// 요청마다 McpServer 를 새로 만든다 (stateless). 호출자의 권한에 맞는 도구만 등록하기 위해서다.
// → read 토큰으로 붙으면 쓰기 도구는 목록에조차 나타나지 않는다.
import "@kb/core/env";
import type { Server } from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, canUse, type Caller } from "./auth.ts";
import { describe, descriptionVersion, descriptionVersions } from "./descriptions/index.ts";
import { registerResources } from "./resources.ts";
import { ServiceError } from "./serviceClient.ts";
import { boardTools } from "./tools/board.ts";
import { policyTools } from "./tools/policy.ts";
import type { ToolDef } from "./tools/types.ts";

export const allTools: ToolDef[] = [...policyTools, ...boardTools];

// 시작할 때 모든 도구에 모든 버전의 description 이 있는지 확인한다 (빠뜨리면 바로 알 수 있게)
for (const [version, texts] of Object.entries(descriptionVersions)) {
  const missing = allTools.filter((t) => !texts[t.name]).map((t) => t.name);
  if (missing.length) throw new Error(`descriptions/${version}.ts 에 description 이 없습니다: ${missing.join(", ")}`);
}

function buildServer(caller: Caller): McpServer {
  const server = new McpServer(
    { name: "kb-policy", version: "0.1.0" },
    { instructions: "가상 헬스케어 앱의 정책 문서와 작업 보드. 정책 질문에는 search_policies 로 시작하세요. 정책 문서를 직접 수정하는 도구는 없습니다." },
  );

  for (const tool of allTools) {
    if (!canUse(caller, tool.scope)) continue; // 권한 밖의 도구는 아예 주지 않는다
    server.registerTool(tool.name, {
      title: tool.title,
      description: describe(tool.name),
      inputSchema: tool.input,
      annotations: { readOnlyHint: tool.readOnly },
      _meta: { requiresApproval: tool.requiresApproval, scope: tool.scope },
    }, async (args: unknown) => {
      try {
        const result = await tool.handler(args as never, caller);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof ServiceError ? `${err.message} (HTTP ${err.status})` : (err as Error).message;
        return { isError: true, content: [{ type: "text" as const, text: `오류: ${msg}` }] };
      }
    });
  }
  registerResources(server);
  return server;
}

const app = new Hono();
app.use("*", logger());
app.get("/health", (c) => c.json({ ok: true, descriptions: descriptionVersion }));

// /internals 페이지용: description 버전별 원문과 도구별 권한/승인 설정 (토큰 필요)
app.get("/descriptions", (c) => {
  if (!authenticate(c.req.header("authorization"))) return c.json({ error: "unauthorized" }, 401);
  return c.json({
    current: descriptionVersion,
    versions: descriptionVersions,
    tools: allTools.map((t) => ({ name: t.name, scope: t.scope, requiresApproval: t.requiresApproval, readOnly: t.readOnly })),
  });
});

app.all("/mcp", async (c) => {
  const auth = authenticate(c.req.header("authorization"));
  if (!auth) {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "유효한 Bearer 토큰이 필요합니다" }, id: null },
      401,
      { "WWW-Authenticate": 'Bearer realm="kb-policy-mcp"' },
    );
  }
  const caller: Caller = { ...auth, runId: c.req.header("x-agent-run-id") };
  const server = buildServer(caller);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: 세션을 기억하지 않는다 (Render 재시작/확장에 안전)
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

const port = Number(process.env.PORT || process.env.MCP_PORT || 8788);
const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`[mcp] http://localhost:${port}/mcp  (descriptions: ${descriptionVersion})`);
});
// Render 같은 프록시 뒤에서 간헐적 502 방지: Node 기본 keep-alive(5초)가 프록시보다 짧으면
// 프록시가 이미 닫힌 연결을 재사용하다 502 를 낸다. 서버 쪽을 프록시보다 길게 잡는다.
(server as Server).keepAliveTimeout = 120_000;
(server as Server).headersTimeout = 121_000;

