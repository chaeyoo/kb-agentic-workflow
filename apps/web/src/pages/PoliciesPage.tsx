// 정책서 뷰어: 문서 목록 → 문서 전문. 인용 링크(#/policies/문서/섹션키@버전)로 들어오면 해당 섹션을 강조한다.
// 변경 이력/diff 는 Day 3 에서 확장한다.
import { useEffect, useState } from "react";
import { api, type DocumentListItem, type PolicyDocument, type PolicySection } from "../api.ts";

interface DocumentView { document: PolicyDocument; version: number; sections: PolicySection[] }

export function PoliciesPage({ documentId, target }: { documentId?: string; target?: string }) {
  const [docs, setDocs] = useState<DocumentListItem[]>([]);
  const [view, setView] = useState<DocumentView>();
  const [targetKey, targetVersion] = (target ?? "").split("@");
  const docId = documentId ?? docs[0]?.id;

  useEffect(() => { api.get<DocumentListItem[]>("/policies").then(setDocs); }, []);
  useEffect(() => { if (docId) api.get<DocumentView>(`/policies/${docId}`).then(setView); }, [docId]);
  useEffect(() => {
    if (targetKey && view) document.getElementById(targetKey)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetKey, view]);

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
            <h1>{view.document.title} <span className="badge">v{view.version}</span></h1>
            <div className="muted">{view.document.role}</div>
            <div className="muted small">담당: {view.document.owner} · 문서 id <code>{view.document.id}</code></div>
          </header>
          {view.sections.map((s) => {
            const highlighted = s.key === targetKey;
            const staleCitation = highlighted && targetVersion && Number(targetVersion) !== s.version;
            return (
              <section key={s.key} id={s.key} className={`policy-section ${highlighted ? "highlight" : ""}`}>
                <h2>{s.heading} <span className="badge">v{s.version}</span> <code className="muted small">{s.key}</code></h2>
                {staleCitation && <div className="notice">인용된 버전은 v{targetVersion} 이고, 현재 버전은 v{s.version} 입니다.</div>}
                <div className="pre">{s.body}</div>
                <div className="muted small">
                  {new Date(s.changedAt).toLocaleDateString("ko-KR")} · {s.changeReason}
                  {s.version > 1 && <> · 이전 버전 {s.version - 1}개</>}
                </div>
              </section>
            );
          })}
        </article>
      )}
    </div>
  );
}
