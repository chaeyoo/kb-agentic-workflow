// MCP resource: 도구 호출 없이 "읽어두는" 배경 지식.
// Claude Code / Cursor 에서 @ 로 첨부하거나, 클라이언트가 컨텍스트로 넣어준다.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { service } from "./serviceClient.ts";
import { listDocuments } from "./tools/policy.ts";

export function registerResources(server: McpServer) {
  server.registerResource("glossary", "policy://glossary", {
    title: "도메인 용어집",
    description: "수검자, 가족 연결, 법정대리인, 노쇼 등 이 도메인의 용어 정의",
    mimeType: "text/markdown",
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: await service.get<string>("/resources/glossary") }],
  }));

  server.registerResource("documents", "policy://documents", {
    title: "정책 문서 목록",
    description: "정책 문서마다의 역할, 담당자, 현재 버전, 섹션 목록",
    mimeType: "text/markdown",
  }, async (uri) => {
    const docs = await listDocuments();
    const text = ["# 정책 문서 목록", ""].concat(docs.map((d) => [
      `## ${d.title} (\`${d.id}\`, v${d.currentVersion})`,
      `- 역할: ${d.role}`,
      `- 담당자: ${d.owner}`,
      `- 섹션: ${(d.sections as { key: string; heading: string }[]).map((s) => `\`${s.key}\` ${s.heading}`).join(", ")}`,
      "",
    ].join("\n"))).join("\n");
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
  });

  server.registerResource("writing-rules", "policy://writing-rules", {
    title: "정책 작성 규칙",
    description: "정책 섹션을 쓰고 고칠 때 지켜야 하는 규칙. 변경안을 제안하기 전에 읽는다",
    mimeType: "text/markdown",
  }, async (uri) => ({
    contents: [{ uri: uri.href, mimeType: "text/markdown", text: await service.get<string>("/resources/writing-rules") }],
  }));
}
