// service 서버: REST API + 에이전트 실행 + 웹 UI(빌드 결과) 서빙
import "@kb/core/env";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { BoardService, FileStore, PolicyService, ProposalService } from "@kb/core";
import { AgentRunner } from "./agent/runner.ts";
import { LLM_MODE, MODEL_LABEL } from "./agent/llm.ts";
import { resetReplayCursor } from "./agent/replay.ts";
import { boardRoutes } from "./api/board.ts";
import { policyRoutes } from "./api/policies.ts";
import { internalsRoutes } from "./api/internals.ts";
import { proposalRoutes } from "./api/proposals.ts";
import { runRoutes } from "./api/runs.ts";

const store = new FileStore();
const policies = new PolicyService(store);
const board = new BoardService(store);
const proposals = new ProposalService(store);
const runner = new AgentRunner(store);

const app = new Hono();
app.use("*", logger());
app.get("/api/health", (c) => c.json({ ok: true, llmMode: LLM_MODE, model: MODEL_LABEL }));
app.route("/api", policyRoutes(policies));
app.route("/api", runRoutes(store, runner));
app.route("/api", boardRoutes(store, board, runner));
app.route("/api", proposalRoutes(proposals, board, runner));
app.route("/api", internalsRoutes(store));
// 발표 리허설용: 시드 상태로 되돌리고 리플레이 순서도 처음으로
app.post("/api/admin/reset", (c) => { store.reset(); resetReplayCursor(); return c.json({ ok: true }); });

// 운영: apps/web 빌드 결과를 같은 서버에서 서빙한다. (개발 중에는 vite dev server 가 5173 에서 뜬다)
const webDist = fileURLToPath(new URL("../../web/dist", import.meta.url));
if (existsSync(webDist)) {
  app.use("/*", serveStatic({ root: webDist }));
  app.get("*", serveStatic({ root: webDist, path: "index.html" }));
}

const port = Number(process.env.PORT || process.env.SERVICE_PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[service] http://localhost:${port}  (store: ${store.path}, llm: ${MODEL_LABEL})`);
  console.log(`[service] ANTHROPIC_API_KEY ${process.env.ANTHROPIC_API_KEY ? "설정됨" : "없음"}, ANTHROPIC_WORKSPACE_ID ${process.env.ANTHROPIC_WORKSPACE_ID || "없음"}`);
});
