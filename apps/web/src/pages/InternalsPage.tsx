// /internals — 발표 중 "안에서 무슨 일이 일어나는지" 보여주는 화면.
//   실행 기록: 최근 AgentRun, 입력/답변, 토큰, 이벤트 타임라인
//   도구: 에이전트가 MCP 에서 받은 도구 목록, 권한, 승인 설정, description v1/v2 비교
import { useEffect, useState } from "react";
import { api, type AgentRun } from "../api.ts";
import { usePolling, useRunEvents } from "../hooks.ts";
import { RichText } from "../components/RichText.tsx";
import { Timeline } from "../components/Timeline.tsx";

type RunSummary = Omit<AgentRun, "events"> & { eventCount: number; toolCalls: string[] };
interface ToolInfo {
  name: string; description: string; scope?: string; requiresApproval?: boolean; readOnly?: boolean;
  inputSchema: unknown; visibleToReadToken: boolean;
}
interface ToolsResponse { mcpUrl: string; descriptionVersion: string; tools: ToolInfo[]; descriptions: Record<string, Record<string, string>> }
interface Stats { runs: number; failed: number; inputTokens: number; cacheReadTokens: number; outputTokens: number; toolCalls: number }

const n = (x: number) => x.toLocaleString("ko-KR");
const triggerLabel = (t: AgentRun["trigger"]) => (t.kind === "ticket" ? `티켓 ${t.ticketId}` : t.kind === "qa" ? "Q&A" : "CLI");

export function InternalsPage({ tab = "runs", id }: { tab?: string; id?: string }) {
  const { data: stats } = usePolling(() => api.get<Stats>("/internals/stats"), [], 4000);
  return (
    <div className="internals">
      <div className="stats">
        {stats && ([
          ["실행", n(stats.runs)], ["실패", n(stats.failed)], ["도구 호출", n(stats.toolCalls)],
          ["입력 토큰", n(stats.inputTokens)], ["캐시 읽기", n(stats.cacheReadTokens)], ["출력 토큰", n(stats.outputTokens)],
        ] as const).map(([label, value]) => <div key={label} className="stat"><div className="muted small">{label}</div><div className="stat-value">{value}</div></div>)}
      </div>
      <nav className="tabs">
        <a href="#/internals/runs" className={tab === "runs" ? "active" : ""}>실행 기록</a>
        <a href="#/internals/tools" className={tab === "tools" ? "active" : ""}>MCP 도구</a>
      </nav>
      {tab === "tools" ? <ToolsView /> : <RunsView runId={id} />}
    </div>
  );
}

function RunsView({ runId }: { runId?: string }) {
  const { data: runs } = usePolling(() => api.get<RunSummary[]>("/runs"), [], 3000);
  const selected = runId ?? runs?.[0]?.id;
  const [run, setRun] = useState<AgentRun>();
  const { events, done } = useRunEvents(selected);
  useEffect(() => { if (selected) api.get<AgentRun>(`/runs/${selected}`).then(setRun); }, [selected, done]);

  return (
    <div className="runs-layout">
      <table className="runs">
        <thead><tr><th>실행</th><th>트리거</th><th>상태</th><th>시간</th><th>도구</th><th>토큰 in/out</th></tr></thead>
        <tbody>
          {(runs ?? []).map((r) => (
            <tr key={r.id} className={r.id === selected ? "active" : ""} onClick={() => { location.hash = `#/internals/runs/${r.id}`; }}>
              <td>{r.id}</td>
              <td>{triggerLabel(r.trigger)}</td>
              <td><span className={`badge run-${r.status}`}>{r.status}</span></td>
              <td>{r.durationMs !== undefined ? `${(r.durationMs / 1000).toFixed(1)}s` : "…"}</td>
              <td title={r.toolCalls.join(", ")}>{r.toolCalls.length}</td>
              <td>{n(r.tokenUsage.inputTokens)} / {n(r.tokenUsage.outputTokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {run && (
        <div className="run-detail card">
          <div className="card-title">{run.id} · {triggerLabel(run.trigger)} · <code>{run.model}</code> · description {run.toolDescriptionVersion}</div>
          <div className="small muted">입력</div>
          <div className="pre run-input">{run.input}</div>
          {run.answer && <><div className="small muted">최종 답변</div><RichText text={run.answer} /></>}
          <div className="small muted" style={{ marginTop: 8 }}>
            토큰: 입력 {n(run.tokenUsage.inputTokens)} · 캐시 읽기 {n(run.tokenUsage.cacheReadTokens)} · 출력 {n(run.tokenUsage.outputTokens)}
            {run.durationMs !== undefined && <> · {(run.durationMs / 1000).toFixed(1)}s</>} · 이벤트 {events.length}개
          </div>
          <h3>타임라인</h3>
          <Timeline events={events} />
        </div>
      )}
    </div>
  );
}

function ToolsView() {
  const [data, setData] = useState<ToolsResponse>();
  const [error, setError] = useState<string>();
  const [compare, setCompare] = useState(false);
  useEffect(() => { api.get<ToolsResponse>("/internals/tools").then(setData).catch((e: Error) => setError(e.message)); }, []);
  if (error) return <div className="error-text">{error}</div>;
  if (!data) return <div className="muted">불러오는 중…</div>;
  return (
    <div>
      <div className="tools-head">
        <span>MCP 서버 <code>{data.mcpUrl}</code> · 현재 description <span className="badge">{data.descriptionVersion}</span> · 도구 {data.tools.length}개</span>
        <label className="small"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> v1 / v2 나란히 보기</label>
      </div>
      <div className="muted small">
        정책서를 직접 수정하는 도구는 없습니다. 쓰기 도구는 propose 토큰에만 보이고, 승인이 필요한 도구는 사람이 승인해야 반영됩니다.
      </div>
      <table className="tools">
        <thead><tr><th>도구</th><th>권한</th><th>승인</th><th>read 토큰</th><th>description</th></tr></thead>
        <tbody>
          {data.tools.map((t) => (
            <tr key={t.name}>
              <td><code>{t.name}</code></td>
              <td><span className={`badge scope-${t.scope}`}>{t.scope}</span></td>
              <td>{t.requiresApproval ? "✋ 필요" : "-"}</td>
              <td>{t.visibleToReadToken ? "보임" : <span className="muted">숨김</span>}</td>
              <td>
                {compare ? (
                  <div className="compare">
                    {Object.entries(data.descriptions).map(([v, d]) => (
                      <div key={v}><div className="badge">{v}</div><div className="pre small">{d[t.name]}</div></div>
                    ))}
                  </div>
                ) : (
                  <details><summary className="small">{t.description.split("\n")[0]}</summary>
                    <div className="pre small">{t.description}</div>
                    <div className="pre small output">{JSON.stringify(t.inputSchema, null, 2)}</div>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
