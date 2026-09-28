// service REST API 호출 + 에이전트 실행 이벤트 구독.
import type {
  AgentRun, Assignee, Comment, PolicyChangeProposal, PolicyDocument, PolicySection, QaSession, RecordedEvent, Ticket,
} from "@kb/core";

export type { AgentRun, Assignee, Comment, PolicyChangeProposal, PolicyDocument, PolicySection, QaSession, RecordedEvent, Ticket };

let currentUser = localStorage.getItem("user") || "김하늘";
export const getUser = () => currentUser;
export const setUser = (name: string) => { currentUser = name; localStorage.setItem("user", name); };

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      "x-actor": encodeURIComponent(JSON.stringify({ kind: "user", name: currentUser })),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
};

export interface TicketDetail {
  ticket: Ticket;
  comments: Comment[];
  sections: { key: string; heading?: string; version?: number; documentId?: string; documentTitle?: string }[];
  runs: { id: string; status: string; startedAt: string; durationMs?: number }[];
  proposals: PolicyChangeProposal[];
  createdByRunId?: string;
  agentRunning: boolean;
}
export type TicketSummary = Ticket & { agentRunning: boolean };
export type DocumentListItem = PolicyDocument & { sections: { key: string; heading: string; version: number }[] };

const EVENT_TYPES = ["thinking", "message_delta", "tool_call", "tool_result", "approval_required", "error", "done"];

/**
 * 실행 이벤트 구독 (SSE). 서버는 지난 이벤트부터 다시 보내주므로, 언제 구독해도 전체 타임라인을 받는다.
 * - 연결될 때마다 서버가 먼저 "run" 을 보낸다 → onReset 으로 이전에 받은 이벤트를 비운다 (재연결 시 중복 방지)
 * - 서버는 스트림을 닫기 전에 "end" 를 보낸다 → 연결을 닫는다 (안 닫으면 EventSource 가 자동 재연결한다)
 */
export function subscribeRun(runId: string, onEvent: (e: RecordedEvent) => void, onReset: () => void): () => void {
  const es = new EventSource(`/api/runs/${runId}/stream`);
  es.addEventListener("run", () => onReset());
  es.addEventListener("end", () => es.close());
  for (const type of EVENT_TYPES) {
    es.addEventListener(type, (msg) => {
      const e = JSON.parse((msg as MessageEvent<string>).data) as RecordedEvent;
      onEvent(e);
      if (e.type === "done") es.close();
    });
  }
  return () => es.close();
}

export const assigneeLabel = (a: Assignee) => (!a ? "미배정" : a.kind === "agent" ? "🤖 Agent" : a.name);
