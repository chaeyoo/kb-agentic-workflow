// 도메인 모델. service / mcp 두 앱이 공유한다.
// 저장소는 파일 기반(JSON)이라 스키마는 이 타입이 전부다.

/** 정책 문서. 섹션 하나가 바뀔 때마다 currentVersion 이 1 오른다. */
export interface PolicyDocument {
  id: string; // 예: "membership"
  title: string; // 예: "회원 자격 정책"
  domain: string; // 예: "회원"
  role: string; // 이 문서가 무엇을 다루는지 한 줄 설명 (MCP resource 로 노출)
  owner: string; // 담당자 (가상 인물)
  currentVersion: number;
}

export type SectionStatus = "draft" | "active" | "deprecated";

/**
 * 정책 섹션의 "한 버전". 같은 섹션의 여러 버전이 레코드로 쌓인다.
 * - key: 버전과 무관한 섹션 식별자 ("membership.age")
 * - id:  특정 버전 식별자 ("membership.age@2") — 인용(citation)은 이 값을 쓴다
 */
export interface PolicySection {
  id: string;
  key: string;
  documentId: string;
  anchor: string;
  order: number; // 문서 안에서의 순서
  heading: string;
  body: string; // markdown
  version: number; // 섹션 버전
  docVersion: number; // 이 섹션 버전이 반영된 문서 버전
  status: SectionStatus;
  changedAt: string; // ISO
  changeReason: string; // 왜 바뀌었는가 (최초 작성이면 "최초 작성")
  proposalId?: string; // 어떤 변경안으로 반영됐는가
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "changes_requested";

export interface PolicyChangeProposal {
  id: string;
  sectionKey: string;
  baseVersion: number; // 어느 버전을 기준으로 만든 변경안인가
  proposedHeading: string;
  proposedBody: string;
  diff: string; // unified diff (표시용)
  rationale: string;
  sourceTicketId?: string;
  sourceRunId?: string;
  status: ProposalStatus;
  createdAt: string;
  reviewer?: string;
  reviewComment?: string;
  reviewedAt?: string;
}

export type TicketType = "policy_gap" | "question" | "task";
export type TicketStatus = "todo" | "in_progress" | "needs_approval" | "in_review" | "done";
export type Assignee = { kind: "user"; name: string } | { kind: "agent" } | null;

export interface Ticket {
  id: string; // 예: "T-12"
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  assignee: Assignee;
  linkedSectionKeys: string[];
  proposalIds: string[];
  prLink?: string;
  createdBy: string; // 사람 이름 또는 "agent"
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  author: { kind: "user"; name: string } | { kind: "agent"; runId?: string };
  body: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// 에이전트 실행 기록
// ---------------------------------------------------------------------------

/** 에이전트 루프가 내보내는 이벤트. UI/CLI 는 이 이벤트를 렌더링만 한다. */
export type AgentEvent =
  | { type: "thinking"; text: string }
  | { type: "message_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string; output: string; durationMs: number }
  | { type: "approval_required"; toolName: string; proposalId?: string; message: string }
  | { type: "error"; message: string; retryable?: boolean }
  | { type: "done"; answer: string; stopReason: string };

/** 이벤트에 시각(t, 실행 시작 기준 ms)을 붙여 저장한다. 리플레이는 이 t 를 따라 재생한다. */
export type RecordedEvent = AgentEvent & { t: number };

export type RunStatus = "running" | "completed" | "failed";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface AgentRun {
  id: string;
  trigger: { kind: "qa" } | { kind: "ticket"; ticketId: string } | { kind: "cli" };
  input: string;
  model: string;
  toolDescriptionVersion: string;
  events: RecordedEvent[];
  status: RunStatus;
  answer?: string;
  tokenUsage: TokenUsage;
  durationMs?: number;
  startedAt: string;
}

export interface Citation {
  sectionId: string; // "membership.age@2"
  sectionKey: string;
  version: number;
}

export interface QaSession {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  noEvidence: boolean;
  runId: string;
  createdAt: string;
}
