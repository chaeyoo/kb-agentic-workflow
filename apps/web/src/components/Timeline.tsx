// 에이전트 타임라인. 루프가 내보낸 이벤트를 "렌더링만" 한다.
// 연속된 thinking / message_delta 조각은 하나로 합치고, tool_call 과 tool_result 는 id 로 짝짓는다.
import type { RecordedEvent } from "../api.ts";
import { RichText } from "./RichText.tsx";

type ToolCall = Extract<RecordedEvent, { type: "tool_call" }>;
type ToolResult = Extract<RecordedEvent, { type: "tool_result" }>;
type Item =
  | { kind: "thinking"; t: number; text: string }
  | { kind: "text"; t: number; text: string }
  | { kind: "tool"; t: number; call: ToolCall; result?: ToolResult }
  | { kind: "event"; t: number; event: RecordedEvent };

export function buildItems(events: RecordedEvent[]): Item[] {
  const items: Item[] = [];
  const tools = new Map<string, Extract<Item, { kind: "tool" }>>();
  for (const e of events) {
    const last = items.at(-1);
    if (e.type === "thinking") {
      if (last?.kind === "thinking") last.text += e.text; else items.push({ kind: "thinking", t: e.t, text: e.text });
    } else if (e.type === "message_delta") {
      if (last?.kind === "text") last.text += e.text; else items.push({ kind: "text", t: e.t, text: e.text });
    } else if (e.type === "tool_call") {
      const item = { kind: "tool" as const, t: e.t, call: e };
      tools.set(e.id, item);
      items.push(item);
    } else if (e.type === "tool_result") {
      const item = tools.get(e.id);
      if (item) item.result = e;
    } else {
      items.push({ kind: "event", t: e.t, event: e });
    }
  }
  return items;
}

const sec = (t: number) => `+${(t / 1000).toFixed(1)}s`;

export function Timeline({ events, showText = true }: { events: RecordedEvent[]; showText?: boolean }) {
  if (events.length === 0) return <div className="muted">이벤트 없음</div>;
  return (
    <ol className="timeline">
      {buildItems(events).map((it, i) => {
        if (it.kind === "thinking") return (
          <li key={i} className="tl thinking"><span className="t">{sec(it.t)}</span>
            <details><summary>💭 생각</summary><div className="pre">{it.text}</div></details></li>
        );
        if (it.kind === "text") return showText ? (
          <li key={i} className="tl text"><span className="t">{sec(it.t)}</span>
            <div><div className="label">💬 응답</div><RichText text={it.text} /></div></li>
        ) : null;
        if (it.kind === "tool") {
          const r = it.result;
          return (
            <li key={i} className={`tl tool ${r ? (r.ok ? "ok" : "fail") : "pending"}`}>
              <span className="t">{sec(it.t)}</span>
              <details>
                <summary>
                  <code className="tool-name">🔧 {it.call.name}</code>{" "}
                  <span className="args">{JSON.stringify(it.call.input)}</span>
                  <div className="result-line">
                    {r ? <>{r.ok ? "✓" : "✗"} {r.summary} <span className="muted">({r.durationMs}ms)</span></> : <span className="muted">실행 중…</span>}
                  </div>
                </summary>
                {r && <div className="pre output">{r.output}</div>}
              </details>
            </li>
          );
        }
        const e = it.event;
        if (e.type === "approval_required") return (
          <li key={i} className="tl approval"><span className="t">{sec(e.t)}</span>✋ 승인 필요: {e.toolName} {e.proposalId} — {e.message}</li>
        );
        if (e.type === "error") return (
          <li key={i} className={`tl ${e.retryable ? "retry" : "error"}`}><span className="t">{sec(e.t)}</span>{e.retryable ? "⟳ " : "⚠ "}{e.message}</li>
        );
        if (e.type === "done") return (
          <li key={i} className="tl done"><span className="t">{sec(e.t)}</span>■ 종료 ({e.stopReason})</li>
        );
        return null;
      })}
    </ol>
  );
}
