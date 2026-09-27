// board 도구: 티켓 조회/생성/상태 변경/코멘트/정책 섹션 연결, 미해결 정책 공백 조회.
import { z } from "zod";
import type { Comment, Ticket } from "@kb/core";
import { service } from "../serviceClient.ts";
import { defineTool } from "./types.ts";

type TicketDetail = {
  ticket: Ticket;
  comments: Comment[];
  sections: { key: string; heading?: string; version?: number; documentTitle?: string }[];
};

const who = (a: Ticket["assignee"]) => (!a ? "미배정" : a.kind === "agent" ? "Agent" : a.name);
const ticketOut = (t: Ticket) => ({
  ticketId: t.id, title: t.title, type: t.type, status: t.status, assignee: who(t.assignee),
  linkedSectionKeys: t.linkedSectionKeys, description: t.description,
});

export const listOpenQuestions = defineTool({
  name: "list_open_questions",
  title: "미해결 정책 공백 목록",
  scope: "read",
  requiresApproval: false,
  readOnly: true,
  input: {},
  async handler() {
    const tickets = await service.get<Ticket[]>("/open-questions");
    return {
      summary: tickets.length ? `미해결 ${tickets.length}건: ${tickets.map((t) => t.id).join(", ")}` : "미해결 정책 공백 없음",
      openQuestions: tickets.map(ticketOut),
    };
  },
});

export const getTicket = defineTool({
  name: "get_ticket",
  title: "티켓 조회",
  scope: "read",
  requiresApproval: false,
  readOnly: true,
  input: { ticketId: z.string().describe("티켓 번호. 예: 'T-4'") },
  async handler({ ticketId }) {
    const d = await service.get<TicketDetail>(`/tickets/${encodeURIComponent(ticketId)}`);
    return {
      summary: `${d.ticket.id} [${d.ticket.status}] ${d.ticket.title} (코멘트 ${d.comments.length})`,
      ticket: ticketOut(d.ticket),
      linkedSections: d.sections,
      comments: d.comments.map((c) => ({
        author: c.author.kind === "agent" ? "Agent" : c.author.name, body: c.body, createdAt: c.createdAt,
      })),
    };
  },
});

export const createTicket = defineTool({
  name: "create_ticket",
  title: "티켓 생성",
  scope: "propose",
  requiresApproval: false,
  readOnly: false,
  input: {
    title: z.string().min(5).describe("무엇을 결정해야 하는지 한 줄. 예: '만 14세 미만 회원의 검진 본인 예약 허용 여부'"),
    description: z.string().min(10).describe("발견 경위, 비어 있거나 충돌하는 내용(인용 포함), 담당자가 고를 선택지"),
    type: z.enum(["policy_gap", "question", "task"]).describe("정책 공백/모순은 policy_gap"),
    linkedSectionKeys: z.array(z.string()).describe("관련 섹션 키 목록. 예: ['membership.age', 'guardian-consent.minor-signup']"),
  },
  async handler(args, caller) {
    const t = await service.post<Ticket>("/tickets", args, caller);
    return { summary: `${t.id} 생성 → 담당 ${who(t.assignee)}`, ticketId: t.id, ticket: ticketOut(t) };
  },
});

export const updateTicketStatus = defineTool({
  name: "update_ticket_status",
  title: "티켓 상태 변경",
  scope: "propose",
  requiresApproval: false,
  readOnly: false,
  input: {
    ticketId: z.string(),
    // done 은 없다: 완료 판단은 사람의 몫이다. needs_approval 은 request_approval 로만 간다.
    status: z.enum(["todo", "in_progress", "in_review"]),
  },
  async handler({ ticketId, status }, caller) {
    const t = await service.patch<Ticket>(`/tickets/${encodeURIComponent(ticketId)}`, { status }, caller);
    return { summary: `${t.id} → ${t.status}`, ticketId: t.id, status: t.status };
  },
});

export const addComment = defineTool({
  name: "add_comment",
  title: "코멘트 작성",
  scope: "propose",
  requiresApproval: false,
  readOnly: false,
  input: {
    ticketId: z.string(),
    body: z.string().min(1).describe("markdown. 근거에는 [[섹션키@버전]] 인용을 붙인다"),
  },
  async handler({ ticketId, body }, caller) {
    const c = await service.post<Comment>(`/tickets/${encodeURIComponent(ticketId)}/comments`, { body }, caller);
    return { summary: `${ticketId} 에 코멘트 ${c.id}`, commentId: c.id };
  },
});

export const linkPolicySection = defineTool({
  name: "link_policy_section",
  title: "정책 섹션 연결",
  scope: "propose",
  requiresApproval: false,
  readOnly: false,
  input: {
    ticketId: z.string(),
    sectionKeys: z.array(z.string()).min(1).describe("연결할 섹션 키. 예: ['guardian-consent.teen-result']"),
  },
  async handler({ ticketId, sectionKeys }, caller) {
    const t = await service.post<Ticket>(`/tickets/${encodeURIComponent(ticketId)}/links`, { sectionKeys }, caller);
    return { summary: `${t.id} 연결 섹션 ${t.linkedSectionKeys.length}개`, linkedSectionKeys: t.linkedSectionKeys };
  },
});

export const boardTools = [listOpenQuestions, getTicket, createTicket, updateTicketStatus, addComment, linkPolicySection];
