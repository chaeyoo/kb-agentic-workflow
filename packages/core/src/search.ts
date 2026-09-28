// 정책 섹션 키워드 검색.
//
// DB 가 없으므로 메모리에서 점수를 매긴다. 문서가 수십 개 수준이면 이걸로 충분하다.
// 한국어는 조사가 붙어 "사용자는" 과 "사용자" 가 다른 단어가 되므로,
// 흔한 조사/어미를 떼어낸 형태로 부분 문자열 매칭을 한다. (형태소 분석기 없이 가는 최소한의 처리)
import type { PolicySection } from "./types.ts";

// 긴 것부터 떼야 "에서" 가 "서" 보다 먼저 잘린다.
const SUFFIXES = [
  "으로는", "에서는", "에게는", "까지는", "부터는",
  "으로", "에서", "에게", "까지", "부터", "하고", "이나", "이랑", "처럼", "보다",
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "와", "과", "도", "만", "나",
];
// 질문에 흔하지만 검색에 도움이 안 되는 말
const STOPWORDS = new Set([
  "있나요", "있나", "있어요", "있습니까", "되나요", "되나", "하나요", "할", "수", "어떻게", "무엇", "뭔가요",
  "알려줘", "알려주세요", "경우", "때", "그", "및", "등", "혹은", "또는", "스스로", "직접", "가능한가요", "가능",
]);

export function tokenize(query: string): string[] {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (const w of raw) {
    if (STOPWORDS.has(w)) continue;
    let t = w;
    for (const s of SUFFIXES) {
      if (t.length > s.length + 1 && t.endsWith(s)) { t = t.slice(0, -s.length); break; }
    }
    // "만" 처럼 한 글자 한국어는 노이즈가 커서 버린다. 숫자는 유지 ("14세" → "14세").
    if (t.length >= 2 || /\d/.test(t)) out.add(t);
  }
  return [...out];
}

export interface SearchHit {
  sectionId: string;
  sectionKey: string;
  documentId: string;
  heading: string;
  version: number;
  score: number;
  matched: string[];
  snippet: string;
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

function makeSnippet(body: string, tokens: string[], width = 90): string {
  const lower = body.toLowerCase();
  const pos = tokens.map((t) => lower.indexOf(t)).filter((p) => p >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, pos - 30);
  const text = body.slice(start, start + width).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + text + (start + width < body.length ? "…" : "");
}

/**
 * 점수 = Σ 토큰별 가중치 × (제목 매칭 2 + 본문 등장 횟수, 최대 2)
 * 가중치는 IDF: 많은 섹션에 나오는 흔한 말("검진", "예약")보다 드문 말("14세", "미만")이 더 중요하다.
 * 매칭된 토큰 종류가 많을수록 가산 → 여러 조건을 동시에 다루는 섹션이 위로 온다.
 */
export function searchSections(
  sections: PolicySection[],
  docTitles: Record<string, string>,
  query: string,
  limit = 8,
): SearchHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const texts = sections.map((s) => ({
    s,
    heading: `${docTitles[s.documentId] ?? ""} ${s.heading}`.toLowerCase(),
    body: s.body.toLowerCase(),
  }));
  const idf = Object.fromEntries(tokens.map((t) => {
    const df = texts.filter((x) => x.heading.includes(t) || x.body.includes(t)).length;
    return [t, Math.log(1 + sections.length / (df || 1))];
  }));

  const hits: SearchHit[] = [];
  for (const { s, heading, body } of texts) {
    let score = 0;
    const matched: string[] = [];
    for (const t of tokens) {
      const tf = (heading.includes(t) ? 2 : 0) + Math.min(2, countOccurrences(body, t));
      if (tf === 0) continue;
      matched.push(t);
      score += idf[t]! * tf;
    }
    if (score === 0) continue;
    score *= 1 + (matched.length - 1) * 0.3;
    hits.push({
      sectionId: s.id, sectionKey: s.key, documentId: s.documentId, heading: s.heading,
      version: s.version, score: Math.round(score * 100) / 100, matched, snippet: makeSnippet(s.body, matched),
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
