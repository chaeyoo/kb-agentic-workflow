// 칸반 보드 + 카드 상세 패널. 담당자를 Agent 로 바꾸면 에이전트가 일을 시작한다.
import { useEffect, useState } from "react";
import { api, assigneeLabel, type Assignee, type TicketDetail, type TicketSummary } from "../api.ts";
import { usePolling, useRunEvents } from "../hooks.ts";
import { RichText, citationHref } from "../components/RichText.tsx";
import { Timeline } from "../components/Timeline.tsx";

const COLUMNS = [
  { status: "todo", label: "To Do" },
  { status: "in_progress", label: "In Progress" },
  { status: "needs_approval", label: "Needs Approval" },
  { status: "in_review", label: "In Review" },
  { status: "done", label: "Done" },
] as const;
const TYPE_LABEL = { policy_gap: "정책 공백", question: "질문", task: "작업" };

export function BoardPage({ ticketId, users }: { ticketId?: string; users: { name: string; role: string }[] }) {
  const { data: tickets, refresh } = usePolling(() => api.get<TicketSummary[]>("/tickets"), []);
  return (
    <div className={`board-layout ${ticketId ? "with-panel" : ""}`}>
      <div className="board">
        {COLUMNS.map((col) => {
          const cards = (tickets ?? []).filter((t) => t.status === col.status);
          return (
            <div key={col.status} className={`column col-${col.status}`}>
              <div className="column-head">{col.label} <span className="muted">{cards.length}</span></div>
              {cards.map((t) => (
                <a key={t.id} href={`#/board/${t.id}`} className={`ticket-card ${t.id === ticketId ? "selected" : ""} type-${t.type}`}>
                  <div className="ticket-meta"><span className="muted">{t.id}</span> <span className={`badge type-${t.type}`}>{TYPE_LABEL[t.type]}</span></div>
                  <div className="ticket-title">{t.title}</div>
                  <div className="ticket-foot">
                    <span className={t.assignee?.kind === "agent" ? "agent" : ""}>{assigneeLabel(t.assignee)}</span>
                    {t.agentRunning && <span className="badge running">작업 중…</span>}
                  </div>
                </a>
              ))}
            </div>
          );
        })}
      </div>
      {ticketId && <TicketPanel key={ticketId} ticketId={ticketId} users={users} onChange={refresh} />}
    </div>
  );
}

function TicketPanel({ ticketId, users, onChange }: { ticketId: string; users: { name: string; role: string }[]; onChange: () => void }) {
  const { data: d, refresh } = usePolling(() => api.get<TicketDetail>(`/tickets/${ticketId}`), [ticketId], 2000);
  const [comment, setComment] = useState("");
  const [selectedRun, setSelectedRun] = useState<string>();
  const latestRun = d?.runs.at(-1)?.id ?? d?.createdByRunId;
  const runId = selectedRun ?? latestRun;
  const { events } = useRunEvents(runId);
  useEffect(() => setSelectedRun(undefined), [latestRun]); // 새 실행이 시작되면 그걸 보여준다

  if (!d) return <aside className="panel"><div className="muted">불러오는 중…</div></aside>;
  const t = d.ticket;
  const update = async (patch: object) => { await api.patch(`/tickets/${t.id}`, patch); refresh(); onChange(); };
  const assigneeValue = !t.assignee ? "" : t.assignee.kind === "agent" ? "@agent" : t.assignee.name;
  const onAssign = (v: string) => update({ assignee: (v === "" ? null : v === "@agent" ? { kind: "agent" } : { kind: "user", name: v }) as Assignee });

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="muted">{t.id}</span> <span className={`badge type-${t.type}`}>{TYPE_LABEL[t.type]}</span>
        <a href="#/board" className="close">✕</a>
      </div>
      <h2>{t.title}</h2>
      <div className="fields">
        <label>상태
          <select value={t.status} onChange={(e) => update({ status: e.target.value })}>
            {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
          </select>
        </label>
        <label>담당자
          <select value={assigneeValue} onChange={(e) => onAssign(e.target.value)}>
            <option value="">미배정</option>
            <option value="@agent">🤖 Agent</option>
            {users.map((u) => <option key={u.name} value={u.name}>{u.name} · {u.role}</option>)}
          </select>
        </label>
        {d.agentRunning
          ? <span className="badge running">에이전트 작업 중…</span>
          : <button className="secondary" onClick={async () => { await api.post(`/tickets/${t.id}/run`, {}); refresh(); onChange(); }}>🤖 에이전트에게 맡기기</button>}
      </div>
      <div className="small muted">작성: {t.createdBy} · {new Date(t.createdAt).toLocaleString("ko-KR")}</div>

      <section><h3>설명</h3><RichText text={t.description || "(없음)"} /></section>

      <section>
        <h3>연결된 정책 섹션</h3>
        {d.sections.length === 0 ? <div className="muted">없음</div> : (
          <ul className="links">{d.sections.map((s) => (
            <li key={s.key}><a href={citationHref(s.key)}>{s.documentTitle} › {s.heading}</a> <span className="muted small">{s.key}@{s.version}</span></li>
          ))}</ul>
        )}
      </section>

      <section>
        <h3>코멘트</h3>
        <ul className="comments">
          {d.comments.map((c) => (
            <li key={c.id} className={c.author.kind === "agent" ? "by-agent" : ""}>
              <div className="comment-head">
                <strong>{c.author.kind === "agent" ? "🤖 Agent" : c.author.name}</strong>
                <span className="muted small">{new Date(c.createdAt).toLocaleString("ko-KR")}</span>
                {c.author.kind === "agent" && c.author.runId && (
                  <button className="link small" onClick={() => setSelectedRun(c.author.kind === "agent" ? c.author.runId : undefined)}>{c.author.runId}</button>
                )}
              </div>
              <RichText text={c.body} />
            </li>
          ))}
        </ul>
        <form className="comment-form" onSubmit={async (e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          await api.post(`/tickets/${t.id}/comments`, { body: comment });
          setComment(""); refresh();
        }}>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="결정 사항이나 질문을 남기세요" />
          <button disabled={!comment.trim()}>코멘트</button>
        </form>
      </section>

      <section>
        <h3>에이전트 타임라인</h3>
        {runId ? (
          <>
            <div className="run-tabs">
              {d.createdByRunId && <button className={runId === d.createdByRunId ? "active" : ""} onClick={() => setSelectedRun(d.createdByRunId)}>생성: {d.createdByRunId}</button>}
              {d.runs.map((r) => (
                <button key={r.id} className={runId === r.id ? "active" : ""} onClick={() => setSelectedRun(r.id)}>{r.id} · {r.status}</button>
              ))}
            </div>
            <Timeline events={events} />
          </>
        ) : <div className="muted">아직 에이전트가 이 티켓을 다룬 적이 없습니다. 담당자를 🤖 Agent 로 바꿔보세요.</div>}
      </section>
    </aside>
  );
}
