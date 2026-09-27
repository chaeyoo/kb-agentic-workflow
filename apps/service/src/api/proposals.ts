// 정책 변경안 API.
//   POST /proposals                      변경안 제출 (mcp 의 propose_policy_change 가 호출)
//   POST /tickets/:id/request-approval   티켓을 Needs Approval 로 (mcp 의 request_approval 이 호출)
//   POST /proposals/:id/review           사람의 승인 / 수정요청 / 거절 (웹 UI 만)
import { Hono } from "hono";
import {
  BoardError, type BoardService, type ProposalService, type ProposeInput, type ReviewAction,
} from "@kb/core";
import type { AgentRunner } from "../agent/runner.ts";
import { actorName, actorOf } from "./actor.ts";

export function proposalRoutes(proposals: ProposalService, board: BoardService, runner: AgentRunner) {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof BoardError) return c.json({ error: err.message }, err.status);
    throw err;
  });

  app.get("/proposals", (c) => c.json(proposals.list({ status: c.req.query("status"), ticketId: c.req.query("ticketId") })));
  app.get("/proposals/:id", (c) => c.json(proposals.get(c.req.param("id"))));

  app.post("/proposals", async (c) => {
    const actor = actorOf(c);
    const body = await c.req.json<ProposeInput>();
    const p = proposals.propose({ ...body, sourceRunId: actor.kind === "agent" ? actor.runId : undefined });
    return c.json(p, 201);
  });

  app.post("/tickets/:id/request-approval", async (c) => {
    const { proposalId, message } = await c.req.json<{ proposalId?: string; message?: string }>();
    const ticket = board.getTicket(c.req.param("id"));
    const p = proposals.get(proposalId ?? "");
    if (p.status !== "pending") throw new BoardError(409, `${p.id} 는 승인 대기 상태가 아닙니다 (${p.status})`);
    if (p.sourceTicketId !== ticket.id) throw new BoardError(400, `${p.id} 는 ${ticket.id} 에서 나온 변경안이 아닙니다`);
    board.addComment(ticket.id, actorOf(c), `✋ 승인 요청: ${p.id} (${p.sectionKey} v${p.baseVersion} → v${p.baseVersion + 1})\n\n${message ?? ""}`.trim());
    board.updateTicket(ticket.id, { status: "needs_approval" });
    return c.json({ ticketId: ticket.id, status: "needs_approval", proposalId: p.id });
  });

  app.post("/proposals/:id/review", async (c) => {
    const actor = actorOf(c);
    // 에이전트는 승인할 수 없다. (MCP 에 승인 도구가 없지만, REST 에서도 한 번 더 막는다)
    if (actor.kind === "agent") return c.json({ error: "변경안 검토는 사람만 할 수 있습니다" }, 403);
    const { action, comment } = await c.req.json<{ action: ReviewAction; comment?: string }>();
    if (!["approve", "request_changes", "reject"].includes(action)) return c.json({ error: "action 이 올바르지 않습니다" }, 400);

    const { proposal, section } = proposals.review(c.req.param("id"), action, actorName(actor), comment);
    const ticketId = proposal.sourceTicketId;
    if (ticketId) {
      const label = { approve: "✅ 승인", request_changes: "↩️ 수정요청", reject: "⛔ 거절" }[action];
      const detail = section ? `${section.key} v${section.version} 로 반영했습니다.` : "";
      board.addComment(ticketId, actor, [`${label}: ${proposal.id}`, detail, comment ?? ""].filter(Boolean).join("\n\n"));
      if (action === "approve") board.updateTicket(ticketId, { status: "done" });
      if (action === "reject") board.updateTicket(ticketId, { status: "in_review" });
      if (action === "request_changes") {
        board.updateTicket(ticketId, { status: "in_progress" });
        // 에이전트 담당 티켓이면 피드백을 반영해 다시 제안하도록 바로 맡긴다 (HITL ② 의 되돌림 루프)
        const t = board.getTicket(ticketId);
        if (t.assignee?.kind === "agent" && !runner.isTicketRunning(t.id)) runner.startTicketRun(t.id);
      }
    }
    return c.json({ proposal, section });
  });

  return app;
}
