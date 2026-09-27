// 시드 markdown(policies/*.md)을 읽어 초기 상태(StoreData)를 만든다.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PolicyDocument, PolicySection } from "../types.ts";
import type { StoreData } from "../store.ts";
import { seedHistory, seedCurrentChangeReasons } from "./history.ts";

const here = dirname(fileURLToPath(import.meta.url));
const SEED_BASE_TIME = "2026-03-02T09:00:00.000Z";

interface ParsedDoc {
  meta: Record<string, string>;
  sections: { anchor: string; heading: string; body: string }[];
}

/** "---\nkey: value\n---" 머리말과 "## 제목 {#anchor}" 섹션을 파싱한다. */
export function parsePolicyMarkdown(src: string): ParsedDoc {
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("정책 문서에 머리말(---)이 없습니다");
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const sections: ParsedDoc["sections"] = [];
  for (const chunk of m[2]!.split(/^## /m).slice(1)) {
    const [first, ...rest] = chunk.split("\n");
    const h = first!.match(/^(.*?)\s*\{#([\w-]+)\}\s*$/);
    if (!h) throw new Error(`섹션 제목에 {#anchor} 가 없습니다: ${first}`);
    sections.push({ heading: h[1]!, anchor: h[2]!, body: rest.join("\n").trim() });
  }
  return { meta, sections };
}

export function loadSeed(): StoreData {
  const dir = join(here, "policies");
  const documents: PolicyDocument[] = [];
  const sections: PolicySection[] = [];

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const { meta, sections: parsed } = parsePolicyMarkdown(readFileSync(join(dir, file), "utf8"));
    const documentId = meta.id!;
    let docVersion = 1; // 모든 섹션의 최초 버전 = 문서 v1

    parsed.forEach((s, order) => {
      const key = `${documentId}.${s.anchor}`;
      const past = seedHistory.filter((h) => h.sectionKey === key);
      // 과거 버전들 (deprecated)
      past.forEach((h, i) => {
        const version = i + 1;
        const dv = version === 1 ? 1 : ++docVersion;
        sections.push({
          id: `${key}@${version}`, key, documentId, anchor: s.anchor, order,
          heading: h.heading, body: h.body, version, docVersion: dv,
          status: "deprecated", changedAt: h.changedAt, changeReason: h.changeReason,
        });
      });
      // 현재 버전 (active)
      const version = past.length + 1;
      const reason = seedCurrentChangeReasons[key];
      sections.push({
        id: `${key}@${version}`, key, documentId, anchor: s.anchor, order,
        heading: s.heading, body: s.body, version,
        docVersion: version === 1 ? 1 : ++docVersion,
        status: "active",
        changedAt: reason?.changedAt ?? SEED_BASE_TIME,
        changeReason: reason?.changeReason ?? "최초 작성",
      });
    });

    documents.push({
      id: documentId, title: meta.title!, domain: meta.domain!, role: meta.role!, owner: meta.owner!,
      currentVersion: docVersion,
    });
  }

  return { documents, sections, proposals: [], tickets: [], comments: [], runs: [], qaSessions: [], counters: {} };
}

export function loadResource(name: "glossary" | "writing-rules"): string {
  return readFileSync(join(here, "resources", `${name}.md`), "utf8");
}
