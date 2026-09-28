// 정책 변경안. 정책 문서가 바뀌는 "유일한" 경로다.
//
//   에이전트 ──propose──▶ pending ──(사람) approve──▶ 새 섹션 버전(active), 이전 버전 deprecated
//                                 ├─(사람) request_changes──▶ 에이전트가 다시 제안
//                                 └─(사람) reject
//
// 승인/수정요청/거절은 사람만 할 수 있다. MCP 에 그런 도구가 없고, REST 에서도 에이전트 호출을 거부한다.
import type { FileStore } from "./store.ts";
import type { PolicyChangeProposal, PolicySection } from "./types.ts";
import { diffLines, formatDiff } from "./diff.ts";
import { BoardError } from "./board.ts";

export interface ProposeInput {
  sectionKey: string;
  baseVersion?: number; // 기준 버전. 생략하면 현재 버전
  proposedHeading?: string;
  proposedBody: string;
  rationale: string;
  sourceTicketId?: string;
  sourceRunId?: string;
}

export type ReviewAction = "approve" | "request_changes" | "reject";

export class ProposalService {
  constructor(private store: FileStore) {}

  private get d() { return this.store.data; }

  list(filter: { status?: string; ticketId?: string } = {}): PolicyChangeProposal[] {
    return this.d.proposals
      .filter((p) => (!filter.status || p.status === filter.status) && (!filter.ticketId || p.sourceTicketId === filter.ticketId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): PolicyChangeProposal {
    const p = this.d.proposals.find((x) => x.id === id);
    if (!p) throw new BoardError(404, `변경안 ${id} 이(가) 없습니다`);
    return p;
  }

  private active(sectionKey: string): PolicySection {
    const s = this.d.sections.find((x) => x.key === sectionKey && x.status === "active");
    if (!s) throw new BoardError(404, `섹션 ${sectionKey} 이(가) 없습니다`);
    return s;
  }

  propose(input: ProposeInput): PolicyChangeProposal {
    const current = this.active(input.sectionKey);
    if (input.baseVersion !== undefined && input.baseVersion !== current.version) {
      throw new BoardError(409, `기준 버전 v${input.baseVersion} 이 현재 버전 v${current.version} 과 다릅니다. 최신 본문을 다시 조회하세요`);
    }
    if (typeof input.proposedBody !== "string" || typeof input.rationale !== "string") {
      throw new BoardError(400, "proposedBody 와 rationale 이 필요합니다");
    }
    const heading = input.proposedHeading?.trim() || current.heading;
    const body = input.proposedBody.trim();
    if (body === current.body && heading === current.heading) throw new BoardError(400, "현재 본문과 같습니다. 바뀐 내용이 없습니다");
    if (!input.rationale.trim()) throw new BoardError(400, "변경 근거(rationale)가 필요합니다");
    if (input.sourceTicketId && !this.d.tickets.some((t) => t.id === input.sourceTicketId)) {
      throw new BoardError(404, `티켓 ${input.sourceTicketId} 이(가) 없습니다`);
    }

    const headingDiff = heading !== current.heading ? `- ## ${current.heading}\n+ ## ${heading}\n` : "";
    const proposal: PolicyChangeProposal = {
      id: this.store.nextId("P"),
      sectionKey: current.key,
      baseVersion: current.version,
      proposedHeading: heading,
      proposedBody: body,
      diff: headingDiff + formatDiff(diffLines(current.body, body)),
      rationale: input.rationale.trim(),
      sourceTicketId: input.sourceTicketId,
      sourceRunId: input.sourceRunId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.d.proposals.push(proposal);
    const ticket = this.d.tickets.find((t) => t.id === input.sourceTicketId);
    if (ticket && !ticket.proposalIds.includes(proposal.id)) ticket.proposalIds.push(proposal.id);
    this.store.save();
    return proposal;
  }

  /** 사람의 검토. approve 면 여기서 정책 섹션의 새 버전이 만들어진다. */
  review(id: string, action: ReviewAction, reviewer: string, comment = ""): { proposal: PolicyChangeProposal; section?: PolicySection } {
    const p = this.get(id);
    if (p.status !== "pending") throw new BoardError(409, `이미 처리된 변경안입니다 (${p.status})`);
    if (action !== "approve" && !comment.trim()) throw new BoardError(400, "수정요청/거절에는 이유가 필요합니다");

    // 검증을 모두 마친 뒤에 기록한다 (거부된 승인 시도가 검토 흔적을 남기지 않게)
    const current = action === "approve" ? this.active(p.sectionKey) : undefined;
    if (current && current.version !== p.baseVersion) {
      throw new BoardError(409, `그 사이 섹션이 v${current.version} 으로 바뀌었습니다. 수정요청으로 다시 제안받으세요`);
    }

    p.reviewer = reviewer;
    p.reviewComment = comment.trim() || undefined;
    p.reviewedAt = new Date().toISOString();

    let section: PolicySection | undefined;
    if (current) {
      const doc = this.d.documents.find((d) => d.id === current.documentId)!;
      doc.currentVersion += 1;
      current.status = "deprecated";
      section = {
        ...current,
        id: `${current.key}@${current.version + 1}`,
        heading: p.proposedHeading,
        body: p.proposedBody,
        version: current.version + 1,
        docVersion: doc.currentVersion,
        status: "active",
        changedAt: p.reviewedAt,
        changeReason: `${p.rationale} (변경안 ${p.id}${p.sourceTicketId ? `, 티켓 ${p.sourceTicketId}` : ""}, 승인 ${reviewer})`,
        proposalId: p.id,
      };
      this.d.sections.push(section);
      p.status = "approved";
    } else {
      p.status = action === "reject" ? "rejected" : "changes_requested";
    }
    this.store.save();
    return { proposal: p, section };
  }
}
