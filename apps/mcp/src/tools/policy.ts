// policy 도구: 정책 문서 검색/조회/이력.
// 모든 도구는 JSON 을 돌려주고, 타임라인 표시용 한 줄 요약(summary)을 함께 넣는다.
import { z } from "zod";
import type { DocumentView, PolicyDocument, PolicySection, SearchHit } from "@kb/core";
import { service } from "../serviceClient.ts";
import { defineTool } from "./types.ts";

const sectionOut = (s: PolicySection) => ({
  sectionId: s.id, sectionKey: s.key, heading: s.heading, version: s.version,
  status: s.status, body: s.body, changedAt: s.changedAt, changeReason: s.changeReason,
});

export const searchPolicies = defineTool({
  name: "search_policies",
  title: "정책 검색",
  scope: "read",
  requiresApproval: false,
  readOnly: true,
  input: {
    query: z.string().min(1).describe("찾을 내용. 질문 문장보다 핵심 키워드 2~4개가 잘 찾아진다. 예: '14세 미만 가입'"),
    limit: z.number().int().min(1).max(20).optional().describe("최대 결과 수 (기본 8)"),
  },
  async handler({ query, limit }) {
    const { hits } = await service.get<{ hits: (SearchHit & { documentTitle: string })[] }>(
      `/policies/search?q=${encodeURIComponent(query)}&limit=${limit ?? 8}`);
    return {
      summary: hits.length
        ? `${hits.length}건: ${hits.slice(0, 3).map((h) => h.sectionId).join(", ")}${hits.length > 3 ? " …" : ""}`
        : `"${query}" 결과 없음`,
      hits: hits.map((h) => ({
        sectionId: h.sectionId, sectionKey: h.sectionKey, documentId: h.documentId,
        documentTitle: h.documentTitle, heading: h.heading, version: h.version, snippet: h.snippet,
      })),
    };
  },
});

export const getPolicyDocument = defineTool({
  name: "get_policy_document",
  title: "정책 문서 조회",
  scope: "read",
  requiresApproval: false,
  readOnly: true,
  input: {
    documentId: z.string().optional().describe("문서 id. 예: 'membership'. sectionKey 를 주면 생략 가능"),
    sectionKey: z.string().optional().describe("섹션 하나만 볼 때. 예: 'membership.age'"),
    version: z.number().int().optional().describe("sectionKey 가 있으면 섹션 버전, 없으면 문서 버전. 생략하면 현재 버전"),
  },
  async handler({ documentId, sectionKey, version }) {
    const v = version ? `?version=${version}` : "";
    if (sectionKey) {
      const s = await service.get<PolicySection>(`/sections/${encodeURIComponent(sectionKey)}${v}`);
      return { summary: `${s.id} ${s.heading}`, section: sectionOut(s) };
    }
    if (!documentId) throw new Error("documentId 또는 sectionKey 중 하나는 필요합니다");
    const view = await service.get<DocumentView>(`/policies/${encodeURIComponent(documentId)}${v}`);
    return {
      summary: `${view.document.title} v${view.version} (섹션 ${view.sections.length}개)`,
      document: {
        id: view.document.id, title: view.document.title, owner: view.document.owner,
        version: view.version, currentVersion: view.document.currentVersion,
      },
      sections: view.sections.map(sectionOut),
    };
  },
});

export const getPolicyHistory = defineTool({
  name: "get_policy_history",
  title: "정책 변경 이력",
  scope: "read",
  requiresApproval: false,
  readOnly: true,
  input: {
    sectionKey: z.string().describe("섹션 키. 예: 'membership.age'"),
  },
  async handler({ sectionKey }) {
    const history = await service.get<PolicySection[]>(`/sections/${encodeURIComponent(sectionKey)}/history`);
    return {
      summary: `${sectionKey} 버전 ${history.length}개 (현재 v${history.at(-1)?.version})`,
      versions: history.map((s) => ({
        version: s.version, status: s.status, changedAt: s.changedAt,
        changeReason: s.changeReason, proposalId: s.proposalId, body: s.body,
      })),
    };
  },
});

export const listDocuments = async () => service.get<(PolicyDocument & { sections: unknown[] })[]>("/policies");

export const policyTools = [searchPolicies, getPolicyDocument, getPolicyHistory];
