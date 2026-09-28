// 정책 문서 조회 로직. (쓰기는 변경안 승인 경로에서만 일어난다 — proposals 참고)
import type { FileStore } from "./store.ts";
import type { PolicyDocument, PolicySection } from "./types.ts";
import { searchSections, type SearchHit } from "./search.ts";

export interface DocumentView {
  document: PolicyDocument;
  version: number; // 조회한 문서 버전
  sections: PolicySection[];
}

export class PolicyService {
  constructor(private store: FileStore) {}

  private get d() { return this.store.data; }

  listDocuments(): (PolicyDocument & { sections: { key: string; heading: string; version: number }[] })[] {
    return this.d.documents.map((doc) => ({
      ...doc,
      sections: this.activeSections(doc.id).map((s) => ({ key: s.key, heading: s.heading, version: s.version })),
    }));
  }

  getDocument(documentId: string): PolicyDocument | undefined {
    return this.d.documents.find((x) => x.id === documentId);
  }

  activeSections(documentId?: string): PolicySection[] {
    return this.d.sections
      .filter((s) => s.status === "active" && (!documentId || s.documentId === documentId))
      .sort((a, b) => a.documentId.localeCompare(b.documentId) || a.order - b.order);
  }

  /**
   * 문서 전체를 특정 문서 버전 시점으로 조회한다.
   * 각 섹션에 대해 docVersion <= version 인 것 중 가장 최신 버전을 고른다.
   */
  viewDocument(documentId: string, version?: number): DocumentView | undefined {
    const document = this.getDocument(documentId);
    if (!document) return undefined;
    const v = version ?? document.currentVersion;
    const byKey = new Map<string, PolicySection>();
    for (const s of this.d.sections) {
      if (s.documentId !== documentId || s.docVersion > v || s.status === "draft") continue;
      const prev = byKey.get(s.key);
      if (!prev || s.version > prev.version) byKey.set(s.key, s);
    }
    return { document, version: v, sections: [...byKey.values()].sort((a, b) => a.order - b.order) };
  }

  /** 섹션 하나를 조회한다. version 을 주지 않으면 현재(active) 버전. */
  getSection(sectionKey: string, version?: number): PolicySection | undefined {
    return this.d.sections.find((s) =>
      s.key === sectionKey && (version === undefined ? s.status === "active" : s.version === version));
  }

  /** 섹션의 모든 버전을 오래된 순서로. */
  getHistory(sectionKey: string): PolicySection[] {
    return this.d.sections.filter((s) => s.key === sectionKey).sort((a, b) => a.version - b.version);
  }

  search(query: string, limit = 8): (SearchHit & { documentTitle: string })[] {
    const titles = Object.fromEntries(this.d.documents.map((x) => [x.id, x.title]));
    return searchSections(this.activeSections(), titles, query, limit)
      .map((h) => ({ ...h, documentTitle: titles[h.documentId] ?? h.documentId }));
  }
}
