// 우리 에이전트도 "MCP 클라이언트"다.
// 외주 개발자의 Claude Code / Cursor 와 똑같이, 원격 MCP 서버에 Bearer 토큰으로 붙어서
// 도구 목록을 받아오고(listTools), 도구를 호출한다(callTool).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type Anthropic from "@anthropic-ai/sdk";

export interface ToolCallResult {
  ok: boolean;
  text: string;
}

export interface Toolbox {
  /** Anthropic API 에 그대로 넘길 수 있는 도구 정의 */
  tools: Anthropic.Tool[];
  /** 도구 정의의 _meta.requiresApproval — 사람 승인이 필요한 도구인가 */
  requiresApproval(name: string): boolean;
  call(name: string, input: unknown): Promise<ToolCallResult>;
  close(): Promise<void>;
}

export async function connectToolbox(opts: { url?: string; token?: string; runId?: string } = {}): Promise<Toolbox> {
  const url = opts.url || process.env.MCP_URL || "http://localhost:8788/mcp";
  const token = opts.token ?? process.env.MCP_AGENT_TOKEN ?? "";
  const client = new Client({ name: "kb-policy-agent", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
        // 어느 실행에서 온 호출인지 알려준다 → 에이전트가 남긴 코멘트/티켓에 실행 기록이 연결된다
        ...(opts.runId && { "X-Agent-Run-Id": opts.runId }),
      },
    },
  });
  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();
  const approval = new Set(mcpTools.filter((t) => t._meta?.requiresApproval === true).map((t) => t.name));

  return {
    // MCP 도구 정의(inputSchema) → Anthropic 도구 정의(input_schema). 이름만 다르고 내용은 같은 JSON Schema 다.
    tools: mcpTools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    })),
    requiresApproval: (name) => approval.has(name),
    async call(name, input) {
      try {
        const res = await client.callTool({ name, arguments: (input ?? {}) as Record<string, unknown> });
        const content = (res.content ?? []) as { type: string; text?: string }[];
        const text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
        return { ok: !res.isError, text };
      } catch (err) {
        // 네트워크 오류, 알 수 없는 도구 등. 모델에게 에러로 돌려주면 다른 방법을 시도한다.
        return { ok: false, text: `도구 호출 실패: ${(err as Error).message}` };
      }
    },
    close: () => client.close(),
  };
}
