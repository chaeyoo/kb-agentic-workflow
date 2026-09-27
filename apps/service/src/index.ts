// service 서버: REST API + 에이전트 실행 (+ Day 2 부터 웹 UI)
import "@kb/core/env";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { BoardService, FileStore, PolicyService } from "@kb/core";
import { AgentRunner } from "./agent/runner.ts";
import { boardRoutes } from "./api/board.ts";
import { policyRoutes } from "./api/policies.ts";
import { runRoutes } from "./api/runs.ts";

const store = new FileStore();
const policies = new PolicyService(store);
const board = new BoardService(store);
const runner = new AgentRunner(store);

const app = new Hono();
app.use("*", logger());
app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", policyRoutes(policies));
app.route("/api", runRoutes(store, runner));
app.route("/api", boardRoutes(store, board, runner));
app.post("/api/admin/reset", (c) => { store.reset(); return c.json({ ok: true }); });

const port = Number(process.env.PORT || process.env.SERVICE_PORT || 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[service] http://localhost:${port}  (store: ${store.path})`);
});
