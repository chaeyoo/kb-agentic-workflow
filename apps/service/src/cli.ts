// pnpm ask "질문" — service 서버에 질문을 보내고, 에이전트 이벤트를 터미널에 그린다.
//
// CLI 는 에이전트를 직접 돌리지 않는다. service 서버의 POST /api/ask 를 호출해서
// SSE 이벤트를 받아 출력만 한다. (웹 UI 와 똑같은 이벤트를 받는다는 것을 보여주기 위함)
//
//   pnpm ask "만 14세 미만 사용자는 검진 예약을 스스로 할 수 있나요?"
//   pnpm ask --verbose "..."   # 도구 결과 원문까지 출력
import "@kb/core/env";
import type { RecordedEvent } from "@kb/core";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose") || args.includes("-v");
const question = args.filter((a) => !a.startsWith("-")).join(" ").trim();
const base = process.env.SERVICE_URL || `http://localhost:${process.env.SERVICE_PORT || 8787}`;

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

if (!question) {
  console.error('사용법: pnpm ask "질문"');
  process.exit(1);
}

let mode: "none" | "thinking" | "text" = "none";
function switchMode(next: typeof mode, header?: string) {
  if (mode !== next) {
    process.stdout.write("\n");
    if (header) process.stdout.write(header + "\n");
    mode = next;
  }
}
const ms = (t: number) => c.dim(`+${(t / 1000).toFixed(1)}s`);

function render(e: RecordedEvent) {
  switch (e.type) {
    case "thinking":
      switchMode("thinking", c.dim("💭 thinking"));
      process.stdout.write(c.dim(e.text));
      break;
    case "message_delta":
      switchMode("text", c.bold("💬 answer"));
      process.stdout.write(e.text);
      break;
    case "tool_call":
      switchMode("none");
      console.log(`${ms(e.t)} ${c.cyan("🔧 " + e.name)} ${c.dim(JSON.stringify(e.input))}`);
      break;
    case "tool_result":
      console.log(`${ms(e.t)} ${e.ok ? c.green("  ✓") : c.red("  ✗")} ${e.summary} ${c.dim(`(${e.durationMs}ms)`)}`);
      if (verbose) console.log(c.dim(e.output.split("\n").map((l) => "    " + l).join("\n")));
      break;
    case "approval_required":
      switchMode("none");
      console.log(`${ms(e.t)} ${c.yellow("✋ 승인 필요")} ${e.toolName} ${e.proposalId ?? ""} — ${e.message}`);
      break;
    case "error":
      switchMode("none");
      console.log(`${ms(e.t)} ${e.retryable ? c.yellow("⟳ " + e.message) : c.red("⚠ " + e.message)}`);
      break;
    case "done":
      switchMode("none");
      console.log(`${ms(e.t)} ${c.dim(`done (${e.stopReason})`)}`);
      break;
  }
}

const res = await fetch(`${base}/api/ask`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-client": "cli" },
  body: JSON.stringify({ question }),
}).catch((err: Error) => {
  console.error(c.red(`service 서버(${base})에 연결할 수 없습니다. pnpm dev 로 서버를 먼저 띄우세요. (${err.message})`));
  process.exit(1);
});
if (!res.ok || !res.body) {
  console.error(c.red(`요청 실패: ${res.status} ${await res.text()}`));
  process.exit(1);
}

console.log(c.bold(`❓ ${question}`));

// SSE 파싱: 빈 줄로 구분된 블록마다 "event:" / "data:" 줄이 있다.
let runId = "";
let buf = "";
const decoder = new TextDecoder();
for await (const chunk of res.body) {
  buf += decoder.decode(chunk as Uint8Array, { stream: true });
  let idx;
  while ((idx = buf.indexOf("\n\n")) >= 0) {
    const block = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    const event = block.match(/^event: (.*)$/m)?.[1];
    const data = block.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
    if (!data) continue;
    if (event === "run") runId = (JSON.parse(data) as { runId: string }).runId;
    else render(JSON.parse(data) as RecordedEvent);
  }
}

const run = (await (await fetch(`${base}/api/runs/${runId}`)).json()) as {
  tokenUsage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  durationMs: number;
};
console.log(c.dim(
  `\n${runId} · ${(run.durationMs / 1000).toFixed(1)}s · 입력 ${run.tokenUsage.inputTokens} / 캐시 ${run.tokenUsage.cacheReadTokens} / 출력 ${run.tokenUsage.outputTokens} tokens`,
));
