// 칸반 보드 REST API. mcp 서버의 board 도구와 웹 UI 가 함께 쓴다.
import { Hono } from "hono";
import { BoardError, seedUsers, type BoardService, type FileStore, type Ticket } from "@kb/core";
import type { AgentRunner } from "../agent/runner.ts";
import { actorName, actorOf } from "./actor.ts";

export function boardRoutes(store: FileStore, board: BoardService, runner: AgentRunner) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof BoardError) return c.json({ error: err.message }, err.status);
    throw err;
  });

  app.get("/users", (c) => c.json(seedUsers));

  app.get("/tickets", (c) => c.json(board.listTickets().map((t) => ({
    ...t, agentRunning: runner.isTicketRunning(t.id),
  }))));

  app.get("/open-questions", (c) => c.json(board.listOpenQuestions()));

  app.get("/tickets/:id", (c) => {
    const ticket = board.getTicket(c.req.param("id"));
    const sections = ticket.linkedSectionKeys.map((key) => {
      const s = store.data.sections.find((x) => x.key === key && x.status === "active");
      const doc = store.data.documents.find((d) => d.id === s?.documentId);
      return { key, heading: s?.heading, version: s?.version, documentId: s?.documentId, documentTitle: doc?.title };
    });
    const runs = store.data.runs
      .filter((r) => r.trigger.kind === "ticket" && r.trigger.ticketId === ticket.id)
      .map(({ id, status, startedAt, durationMs }) => ({ id, status, startedAt, durationMs }));
    // 이 티켓을 만든 실행 (Q&A 에서 에이전트가 정책 공백 티켓을 만든 경우)
    const createdByRun = store.data.runs.find((r) => r.events.some(
      (e) => e.type === "tool_result" && e.name === "create_ticket" && e.ok && e.output.includes(`"ticketId": "${ticket.id}"`)));
    return c.json({
      ticket, comments: board.getComments(ticket.id), sections, runs,
      createdByRunId: createdByRun?.id, agentRunning: runner.isTicketRunning(ticket.id),
    });
  });

  app.post("/tickets", async (c) => {
    const body = await c.req.json<Partial<Ticket>>();
    const ticket = board.createTicket({
      title: body.title ?? "",
      description: body.description ?? "",
      type: body.type ?? "question",
      linkedSectionKeys: body.linkedSectionKeys,
      assignee: body.assignee,
    }, actorName(actorOf(c)));
    maybeStartAgent(ticket);
    return c.json(ticket, 201);
  });

  app.patch("/tickets/:id", async (c) => {
    const body = await c.req.json<Partial<Ticket>>();
    const before = board.getTicket(c.req.param("id"));
    const wasAgent = before.assignee?.kind === "agent";
    const ticket = board.updateTicket(before.id, {
      ...(body.status && { status: body.status }),
      ...(body.assignee !== undefined && { assignee: body.assignee }),
      ...(body.title && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.prLink !== undefined && { prLink: body.prLink }),
    });
    // 담당자를 Agent 로 바꾸는 순간 에이전트가 일을 시작한다.
    if (!wasAgent) maybeStartAgent(ticket);
    return c.json(ticket);
  });

  app.post("/tickets/:id/comments", async (c) => {
    const { body } = await c.req.json<{ body?: string }>();
    return c.json(board.addComment(c.req.param("id"), actorOf(c), body ?? ""), 201);
  });

  app.post("/tickets/:id/links", async (c) => {
    const { sectionKeys } = await c.req.json<{ sectionKeys?: string[] }>();
    return c.json(board.linkSections(c.req.param("id"), sectionKeys ?? []));
  });

  /** 에이전트에게 (다시) 맡기기 */
  app.post("/tickets/:id/run", (c) => {
    const ticket = board.getTicket(c.req.param("id"));
    if (runner.isTicketRunning(ticket.id)) return c.json({ error: "이미 에이전트가 작업 중입니다" }, 409);
    if (ticket.assignee?.kind !== "agent") board.updateTicket(ticket.id, { assignee: { kind: "agent" } });
    return c.json({ runId: runner.startTicketRun(ticket.id) }, 202);
  });

  function maybeStartAgent(ticket: Ticket) {
    if (ticket.assignee?.kind === "agent" && !runner.isTicketRunning(ticket.id)) runner.startTicketRun(ticket.id);
  }

  return app;
}
