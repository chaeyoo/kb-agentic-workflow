// 정책 조회 REST API. mcp 서버의 policy 도구들이 이 API 를 호출한다.
// (정책 문서를 직접 수정하는 API 는 없다. 변경은 변경안 승인 경로로만 — Day 3)
import { Hono } from "hono";
import { loadResource, type PolicyService } from "@kb/core";

export function policyRoutes(policies: PolicyService) {
  const app = new Hono();

  app.get("/policies", (c) => c.json(policies.listDocuments()));

  app.get("/policies/search", (c) => {
    const q = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 8);
    return c.json({ query: q, hits: policies.search(q, limit) });
  });

  app.get("/policies/:documentId", (c) => {
    const v = c.req.query("version");
    const view = policies.viewDocument(c.req.param("documentId"), v ? Number(v) : undefined);
    return view ? c.json(view) : c.json({ error: "문서를 찾을 수 없습니다" }, 404);
  });

  app.get("/sections/:key", (c) => {
    const v = c.req.query("version");
    const section = policies.getSection(c.req.param("key"), v ? Number(v) : undefined);
    return section ? c.json(section) : c.json({ error: "섹션을 찾을 수 없습니다" }, 404);
  });

  app.get("/sections/:key/history", (c) => {
    const history = policies.getHistory(c.req.param("key"));
    return history.length ? c.json(history) : c.json({ error: "섹션을 찾을 수 없습니다" }, 404);
  });

  // MCP resource 의 원천: 용어집, 정책 작성 규칙
  app.get("/resources/:name", (c) => {
    const name = c.req.param("name");
    if (name !== "glossary" && name !== "writing-rules") return c.json({ error: "없는 리소스" }, 404);
    return c.text(loadResource(name));
  });

  return app;
}
