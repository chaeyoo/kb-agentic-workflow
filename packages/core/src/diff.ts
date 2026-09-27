// 줄 단위 diff (LCS). 정책 섹션은 수십 줄이라 O(n·m) 로 충분하다. 의존성을 늘리지 않으려고 직접 구현.

export type DiffLine = { op: " " | "-" | "+"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  // lcs[i][j] = a[i..], b[j..] 의 최장 공통 부분열 길이
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ op: " ", text: a[i]! }); i++; j++; }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: "-", text: a[i++]! });
    else out.push({ op: "+", text: b[j++]! });
  }
  while (i < a.length) out.push({ op: "-", text: a[i++]! });
  while (j < b.length) out.push({ op: "+", text: b[j++]! });
  return out;
}

/** 저장/표시용 텍스트: 각 줄 앞에 " ", "-", "+" */
export function formatDiff(lines: DiffLine[]): string {
  return lines.map((l) => `${l.op} ${l.text}`).join("\n");
}

export function parseDiff(text: string): DiffLine[] {
  return text.split("\n").map((l) => ({ op: (l[0] ?? " ") as DiffLine["op"], text: l.slice(2) }));
}
