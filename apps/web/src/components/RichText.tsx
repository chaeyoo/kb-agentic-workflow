// 에이전트가 쓴 텍스트 표시: 줄바꿈 유지, [[섹션키@버전]] 인용을 정책서 링크로, T-숫자를 티켓 링크로.
import { Fragment } from "react";

export function citationHref(sectionKey: string, version?: number) {
  const docId = sectionKey.split(".")[0];
  return `#/policies/${docId}/${sectionKey}${version ? `@${version}` : ""}`;
}

export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[\[[\w.-]+@\d+\]\]|\bT-\d+\b|\*\*[^*]+\*\*)/g);
  return (
    <div className="rich">
      {parts.map((p, i) => {
        const cite = p.match(/^\[\[([\w.-]+)@(\d+)\]\]$/);
        if (cite) return <a key={i} className="cite" href={citationHref(cite[1]!, Number(cite[2]))}>{cite[1]}@{cite[2]}</a>;
        if (/^T-\d+$/.test(p)) return <a key={i} className="ticket-link" href={`#/board/${p}`}>{p}</a>;
        if (/^\*\*.+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </div>
  );
}

/** "판정: ..." 줄을 뽑아 배지로 보여준다. */
export function verdictOf(answer: string): "ok" | "gap" | "conflict" | undefined {
  const m = answer.match(/판정:\s*(근거 있음|근거 부족|문서 간 모순)/);
  if (!m) return undefined;
  return m[1] === "근거 있음" ? "ok" : m[1] === "근거 부족" ? "gap" : "conflict";
}

export function VerdictBadge({ answer }: { answer: string }) {
  const v = verdictOf(answer);
  if (!v) return null;
  const label = { ok: "✅ 근거 있음", gap: "⚠️ 근거 없음", conflict: "⚠️ 문서 간 모순" }[v];
  return <span className={`badge verdict-${v}`}>{label}</span>;
}
