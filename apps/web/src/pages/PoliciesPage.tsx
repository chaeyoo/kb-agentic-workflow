// 정책서 뷰어: 문서 목록 → 문서 전문(버전 선택 가능) → 섹션별 변경 이력과 diff.
// 인용 링크(#/policies/문서/섹션키@버전)로 들어오면 해당 섹션을 강조한다.
import { useEffect, useState } from "react";
import { api, type DocumentListItem, type PolicyChangeProposal, type PolicyDocument, type PolicySection } from "../api.ts";
import { DiffView } from "../components/DiffView.tsx";

interface DocumentView { document: PolicyDocument; version: number; sections: PolicySection[] }

export function PoliciesPage({ documentId, target }: { documentId?: string; target?: string }) {
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  // 버전 선택은 문서별로 기억한다. 문서를 바꾸는 순간 이전 문서의 버전으로 요청하지 않게.
  const [picked, setPicked] = useState<{ docId?: string; version: number }>();
  const [view, setView] = useState<DocumentView>();
  const [pending, setPending] = useState<PolicyChangeProposal[]>([]);
  const [targetKey, targetVersion] = (target ?? "").split("@");
  const docId = documentId ?? docs[0]?.id;
  // docId 가 아직 없으면(목록 로딩 전) picked 도 없어서 undefined === undefined 로 크래시하지 않게 옵셔널로 읽는다.
  const version = picked?.docId === docId ? picked?.version : undefined;
  const setVersion = (v: number) => setPicked({ docId, version: v });

  useEffect(() => {
    api.get<DocumentListItem[]>("/policies").then(setDocs);
    api.get<PolicyChangeProposal[]>("/proposals?status=pending").then(setPending);
  }, [documentId]);
  useEffect(() => {
    if (!docId) return;
    let alive = true; // 늦게 도착한 이전 요청의 응답은 버린다
    api.get<DocumentView>(`/policies/${docId}${version ? `?version=${version}` : ""}`).then((v) => { if (alive) setView(v); });
    return () => { alive = false; };
  }, [docId, version]);
  useEffect(() => {
    if (targetKey && view) document.getElementById(targetKey)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetKey, view]);

  const current = view?.document.currentVersion ?? 1;
  return (
    <div className="policies-layout">
      <nav className="doc-list">
        {docs.map((d) => (
          <a key={d.id} href={`#/policies/${d.id}`} className={d.id === docId ? "active" : ""}>
            <div>{d.title}</div><div className="muted small">{d.domain} · v{d.currentVersion}</div>
          </a>
        ))}
      </nav>
      {view && (
        <article className="doc">
          <header>
            <h1>
              {view.document.title}{" "}
              <select value={view.version} onChange={(e) => setVersion(Number(e.target.value))}>
                {Array.from({ length: current }, (_, i) => current - i).map((v) => (
                  <option key={v} value={v}>v{v}{v === current ? " (현재)" : ""}</option>
                ))}
              </select>
            </h1>
            <div className="muted">{view.document.role}</div>
            <div className="muted small">담당: {view.document.owner} · 문서 id <code>{view.document.id}</code></div>
            {view.version !== current && <div className="notice">과거 버전(v{view.version})을 보고 있습니다.</div>}
          </header>
          {view.sections.map((s) => (
            <SectionView key={s.key} section={s} highlighted={s.key === targetKey} citedVersion={targetVersion}
              pending={pending.filter((p) => p.sectionKey === s.key)} />
          ))}
        </article>
      )}
    </div>
  );
}

function SectionView({ section: s, highlighted, citedVersion, pending }: {
  section: PolicySection; highlighted: boolean; citedVersion?: string; pending: PolicyChangeProposal[];
}) {
  const [history, setHistory] = useState<PolicySection[]>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !history) api.get<PolicySection[]>(`/sections/${s.key}/history`).then(setHistory);
  }, [open, history, s.key]);
  const stale = highlighted && citedVersion && Number(citedVersion) !== s.version;

  return (
    <section id={s.key} className={`policy-section ${highlighted ? "highlight" : ""}`}>
      <h2>{s.heading} <span className="badge">v{s.version}</span> <code className="muted small">{s.key}</code></h2>
      {stale && <div className="notice">인용된 버전은 v{citedVersion} 이고, 지금 보고 있는 버전은 v{s.version} 입니다.</div>}
      {pending.map((p) => (
        <div key={p.id} className="notice">⏳ 승인 대기 중인 변경안 {p.id} 이(가) 있습니다{p.sourceTicketId && <> — <a href={`#/board/${p.sourceTicketId}`}>{p.sourceTicketId}</a></>}</div>
      ))}
      <div className="pre">{s.body}</div>
      <div className="section-foot muted small">
        {new Date(s.changedAt).toLocaleDateString("ko-KR")} · {s.changeReason}
        {s.version > 1 && <button className="link small" onClick={() => setOpen(!open)}>{open ? "이력 닫기" : `변경 이력 ${s.version}개 버전`}</button>}
      </div>
      {open && history && (
        <ol className="history-list">
          {[...history].reverse().map((h) => {
            const prev = history.find((x) => x.version === h.version - 1);
            return (
              <li key={h.id}>
                <div><strong>v{h.version}</strong> <span className="muted small">{new Date(h.changedAt).toLocaleString("ko-KR")}</span> {h.status === "active" && <span className="badge">현재</span>}</div>
                <div className="small">{h.changeReason}</div>
                {prev ? <DiffView before={prev.body} after={h.body} /> : <div className="muted small">최초 버전</div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
