// 줄 단위 diff 표시. 삭제는 빨강, 추가는 초록.
import { diffLines, parseDiff, type DiffLine } from "@kb/core/diff";

export function DiffView({ diff, before, after }: { diff?: string; before?: string; after?: string }) {
  const lines: DiffLine[] = diff !== undefined ? parseDiff(diff) : diffLines(before ?? "", after ?? "");
  return (
    <pre className="diff">
      {lines.map((l, i) => (
        <div key={i} className={l.op === "+" ? "add" : l.op === "-" ? "del" : "same"}>
          <span className="op">{l.op}</span>{l.text || " "}
        </div>
      ))}
    </pre>
  );
}
