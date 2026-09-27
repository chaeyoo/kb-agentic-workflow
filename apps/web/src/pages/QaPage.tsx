// Q&A: 질문 → 스트리밍 답변 + 인용 + 타임라인. 근거가 없으면 티켓으로 넘긴다.
import { useEffect, useState } from "react";
import { api, type AgentRun, type QaSession, type Ticket } from "../api.ts";
import { usePolling, useRunEvents } from "../hooks.ts";
import { RichText, VerdictBadge, verdictOf } from "../components/RichText.tsx";
import { Timeline, buildItems } from "../components/Timeline.tsx";

const EXAMPLES = [
  "만 14세 미만 사용자는 검진 예약을 스스로 할 수 있나요?",
  "검진 전날 예약을 취소하면 어떻게 되나요?",
  "야간에 결과 등록 알림을 보내도 되나요?",
  "만 16세 자녀의 검진 결과를 부모가 앱에서 볼 수 있나요?",
];

export function QaPage({ runId }: { runId?: string }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AgentRun>();
  const [manualTicket, setManualTicket] = useState<string>();
  const { events, done } = useRunEvents(runId);
  const { data: history } = usePolling(() => api.get<QaSession[]>("/qa"), [], 5000);

  useEffect(() => {
    setManualTicket(undefined);
    if (runId) api.get<AgentRun>(`/runs/${runId}`).then((r) => { setRun(r); setQuestion(r.input); }).catch(() => {});
  }, [runId]);

  async function ask(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const { runId: id } = await api.post<{ runId: string }>("/qa", { question: q });
      location.hash = `#/qa/${id}`;
    } finally { setBusy(false); }
  }

  const items = buildItems(events);
  const last = items.at(-1);
  const answer = done ? done.answer : last?.kind === "text" ? last.text : "";
  // 에이전트가 이번 실행에서 만든 티켓
  const createdTicket = events.flatMap((e) => {
    if (e.type !== "tool_result" || e.name !== "create_ticket" || !e.ok) return [];
    try { return [(JSON.parse(e.output) as { ticketId: string }).ticketId]; } catch { return []; }
  })[0];
  const verdict = done ? verdictOf(done.answer) : undefined;

  async function createGapTicket() {
    const citations = [...(done?.answer ?? "").matchAll(/\[\[([\w.-]+)@\d+\]\]/g)].map((m) => m[1]!);
    const t = await api.post<Ticket>("/tickets", {
      title: `정책 확인 요청: ${run?.input ?? question}`,
      description: `Q&A 에서 근거를 찾지 못했습니다 (${runId}).\n\n질문: ${run?.input}\n\n에이전트 답변:\n${done?.answer}`,
      type: "policy_gap",
      linkedSectionKeys: [...new Set(citations)],
    });
    setManualTicket(t.id);
  }

  return (
    <div className="qa-layout">
      <section className="qa-main">
        <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2}
            placeholder="정책에 대해 물어보세요" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }} />
          <button disabled={busy || !question.trim()}>질문</button>
        </form>
        <div className="examples">
          {EXAMPLES.map((q) => <button key={q} className="chip" onClick={() => { setQuestion(q); ask(q); }}>{q}</button>)}
        </div>

        {runId && (
          <div className="answer card">
            <div className="answer-head">
              <strong>답변</strong> {done ? <VerdictBadge answer={done.answer} /> : <span className="badge running">작업 중…</span>}
              <a className="muted small" href={`#/internals/runs/${runId}`}>{runId}</a>
            </div>
            {answer ? <RichText text={answer} /> : <div className="muted">정책 문서를 찾는 중…</div>}
            {createdTicket && <div className="notice">🎫 에이전트가 정책 공백 티켓 <a href={`#/board/${createdTicket}`}>{createdTicket}</a> 을 만들어 담당자에게 확인을 요청했습니다.</div>}
            {done && verdict && verdict !== "ok" && !createdTicket && (
              manualTicket
                ? <div className="notice">🎫 <a href={`#/board/${manualTicket}`}>{manualTicket}</a> 을 만들었습니다.</div>
                : <button className="secondary" onClick={createGapTicket}>정책 공백 티켓 만들기</button>
            )}
          </div>
        )}

        {runId && (
          <div className="card">
            <div className="card-title">에이전트 타임라인</div>
            <Timeline events={events} showText={false} />
          </div>
        )}
      </section>

      <aside className="qa-side">
        <div className="card-title">최근 질문</div>
        <ul className="history">
          {(history ?? []).slice(0, 20).map((q) => (
            <li key={q.id} className={q.runId === runId ? "active" : ""}>
              <a href={`#/qa/${q.runId}`}>{q.question}</a>
              <div><VerdictBadge answer={q.answer} /> <span className="muted small">인용 {q.citations.length}</span></div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
