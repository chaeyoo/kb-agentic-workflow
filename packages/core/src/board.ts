// 칸반 보드: 티켓과 코멘트.
import type { FileStore } from "./store.ts";
import type { Assignee, Comment, Ticket, TicketStatus, TicketType } from "./types.ts";

export const TICKET_STATUSES: TicketStatus[] = ["todo", "in_progress", "needs_approval", "in_review", "done"];

export class BoardError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message); }
}

export interface CreateTicketInput {
  title: string;
  description: string;
  type: TicketType;
  linkedSectionKeys?: string[];
  assignee?: Assignee;
}

export class BoardService {
  constructor(private store: FileStore) {}

  private get d() { return this.store.data; }
  private now() { return new Date().toISOString(); }

  listTickets(): Ticket[] {
    return [...this.d.tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getTicket(id: string): Ticket {
    const t = this.d.tickets.find((x) => x.id === id);
    if (!t) throw new BoardError(404, `티켓 ${id} 이(가) 없습니다`);
    return t;
  }

  getComments(ticketId: string): Comment[] {
    return this.d.comments.filter((c) => c.ticketId === ticketId);
  }

  /** 미해결 정책 공백 = 완료되지 않은 policy_gap 티켓 */
  listOpenQuestions(): Ticket[] {
    return this.listTickets().filter((t) => t.type === "policy_gap" && t.status !== "done");
  }

  createTicket(input: CreateTicketInput, createdBy: string): Ticket {
    if (!input.title.trim()) throw new BoardError(400, "제목이 필요합니다");
    const keys = this.validateSectionKeys(input.linkedSectionKeys ?? []);
    const ticket: Ticket = {
      id: this.store.nextId("T"),
      title: input.title.trim(),
      description: input.description.trim(),
      type: input.type,
      status: "todo",
      // 담당자를 정하지 않은 정책 공백은 연결된 첫 섹션의 문서 담당자에게 배정한다.
      assignee: input.assignee ?? this.ownerOf(keys[0]),
      linkedSectionKeys: keys,
      proposalIds: [],
      createdBy,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.d.tickets.push(ticket);
    this.store.save();
    return ticket;
  }

  updateTicket(id: string, patch: Partial<Pick<Ticket, "status" | "assignee" | "title" | "description" | "prLink">>): Ticket {
    const t = this.getTicket(id);
    if (patch.status && !TICKET_STATUSES.includes(patch.status)) throw new BoardError(400, `알 수 없는 상태: ${patch.status}`);
    Object.assign(t, patch, { updatedAt: this.now() });
    this.store.save();
    return t;
  }

  addComment(ticketId: string, author: Comment["author"], body: string): Comment {
    const t = this.getTicket(ticketId);
    if (!body.trim()) throw new BoardError(400, "코멘트 내용이 필요합니다");
    const comment: Comment = { id: this.store.nextId("C"), ticketId, author, body: body.trim(), createdAt: this.now() };
    this.d.comments.push(comment);
    t.updatedAt = comment.createdAt;
    this.store.save();
    return comment;
  }

  linkSections(ticketId: string, sectionKeys: string[]): Ticket {
    const t = this.getTicket(ticketId);
    const keys = this.validateSectionKeys(sectionKeys);
    t.linkedSectionKeys = [...new Set([...t.linkedSectionKeys, ...keys])];
    t.updatedAt = this.now();
    this.store.save();
    return t;
  }

  private validateSectionKeys(keys: string[]): string[] {
    const known = new Set(this.d.sections.map((s) => s.key));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length) throw new BoardError(400, `없는 섹션 키: ${unknown.join(", ")}`);
    return [...new Set(keys)];
  }

  private ownerOf(sectionKey?: string): Assignee {
    if (!sectionKey) return null;
    const docId = this.d.sections.find((s) => s.key === sectionKey)?.documentId;
    const owner = this.d.documents.find((d) => d.id === docId)?.owner; // "회원팀 한서윤"
    const name = owner?.split(" ").at(-1);
    return name ? { kind: "user", name } : null;
  }
}
