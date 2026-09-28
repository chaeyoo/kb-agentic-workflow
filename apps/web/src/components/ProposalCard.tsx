// 변경안 카드: diff, 근거, 그리고 사람의 승인 / 수정요청 / 거절 (HITL ②).
import { useState } from "react";
import { api, type PolicyChangeProposal } from "../api.ts";
import { citationHref, RichText } from "./RichText.tsx";
import { DiffView } from "./DiffView.tsx";

const STATUS = {
  pending: "⏳ 승인 대기", approved: "✅ 승인됨", rejected: "⛔ 거절됨", changes_requested: "↩️ 수정요청됨",
} as const;

export function ProposalCard({ proposal: p, onReviewed }: { proposal: PolicyChangeProposal; onReviewed: () => void }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function review(action: "approve" | "request_changes" | "reject") {
    setBusy(true); setError(undefined);
    try {
      await api.post(`/proposals/${p.id}/review`, { action, comment });
      setComment(""); onReviewed();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className={`proposal ${p.status}`}>
      <div className="proposal-head">
        <strong>{p.id}</strong>
        <a href={citationHref(p.sectionKey, p.baseVersion)}>{p.sectionKey}</a>
        <span className="muted small">v{p.baseVersion} → v{p.baseVersion + 1}</span>
        <span className={`badge status-${p.status}`}>{STATUS[p.status]}</span>
      </div>
      <div className="small"><strong>근거</strong> <RichText text={p.rationale} /></div>
      <DiffView diff={p.diff} />
      {p.status === "pending" ? (
        <div className="review">
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="검토 의견 (수정요청/거절 시 필수)" />
          <div className="review-buttons">
            <button disabled={busy} onClick={() => review("approve")}>✅ 승인</button>
            <button disabled={busy || !comment.trim()} className="secondary" onClick={() => review("request_changes")}>↩️ 수정요청</button>
            <button disabled={busy || !comment.trim()} className="danger" onClick={() => review("reject")}>⛔ 거절</button>
          </div>
          <div className="muted small">승인하면 정책서에 새 버전으로 반영됩니다. 승인 없이는 정책서가 바뀌지 않습니다.</div>
          {error && <div className="error-text">{error}</div>}
        </div>
      ) : (
        <div className="muted small">{p.reviewer} · {p.reviewedAt && new Date(p.reviewedAt).toLocaleString("ko-KR")} {p.reviewComment && `— ${p.reviewComment}`}</div>
      )}
    </div>
  );
}
