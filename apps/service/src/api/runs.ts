// 에이전트 실행 API
//   POST /ask            질문 → 실행 시작, 이벤트를 SSE 로 스트리밍
//   GET  /runs           최근 실행 목록
//   GET  /runs/:id       실행 기록 (이벤트 전체 포함)
//   GET  /runs/:id/stream  실행 이벤트 구독 (진행 중이면 실시간, 끝났으면 기록 전체)
//   POST /qa             (웹 UI) 질문 → runId
import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { FileStore, RecordedEvent } from "@kb/core";
import type { AgentRunner } from "../agent/runner.ts";

function pipeRun(stream: SSEStreamingApi, runner: AgentRunner, runId: string) {
  return new Promise<void>((resolve) => {
    let chain = stream.writeSSE({ event: "run", data: JSON.stringify({ runId }) });
    const unsubscribe = runner.subscribe(
      runId,
      (e: RecordedEvent) => { chain = chain.then(() => stream.writeSSE({ event: e.type, data: JSON.stringify(e) })); },
      () => { chain.then(resolve); },
    );
    stream.onAbort(() => { unsubscribe(); resolve(); });
  });
}

export function runRoutes(store: FileStore, runner: AgentRunner) {
  const app = new Hono();

  app.post("/ask", async (c) => {
    const { question } = await c.req.json<{ question?: string }>();
    if (!question?.trim()) return c.json({ error: "question 이 필요합니다" }, 400);
    const trigger = c.req.header("x-client") === "cli" ? { kind: "cli" as const } : { kind: "qa" as const };
    const { runId } = runner.start(question.trim(), trigger);
    return streamSSE(c, (stream) => pipeRun(stream, runner, runId));
  });

  // 웹 UI 용: 실행만 시작하고 runId 를 돌려준다. 이벤트는 GET /runs/:id/stream 으로 구독.
  app.post("/qa", async (c) => {
    const { question } = await c.req.json<{ question?: string }>();
    if (!question?.trim()) return c.json({ error: "question 이 필요합니다" }, 400);
    return c.json({ runId: runner.start(question.trim(), { kind: "qa" }).runId }, 202);
  });

  app.get("/runs", (c) =>
    c.json([...store.data.runs].reverse().slice(0, 50).map(({ events, ...r }) => ({
      ...r,
      eventCount: events.length,
      toolCalls: events.filter((e) => e.type === "tool_call").map((e) => (e.type === "tool_call" ? e.name : "")),
    }))));

  app.get("/runs/:id", (c) => {
    const run = store.data.runs.find((r) => r.id === c.req.param("id"));
    return run ? c.json(run) : c.json({ error: "실행 기록이 없습니다" }, 404);
  });

  app.get("/runs/:id/stream", (c) => streamSSE(c, (stream) => pipeRun(stream, runner, c.req.param("id"))));

  app.get("/qa", (c) => c.json([...store.data.qaSessions].reverse()));
  app.get("/qa/by-run/:runId", (c) => {
    const qa = store.data.qaSessions.find((q) => q.runId === c.req.param("runId"));
    return qa ? c.json(qa) : c.json({ error: "Q&A 기록이 없습니다" }, 404);
  });

  return app;
}
