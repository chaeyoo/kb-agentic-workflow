// pnpm check:deploy — 배포(또는 로컬) 환경이 제대로 연결됐는지 한 번에 점검한다.
//
//   pnpm check:deploy                                   # 로컬 (pnpm dev 가 떠 있어야 함)
//   READ_TOKEN=<read 토큰> pnpm check:deploy \
//     --service https://kb-policy-service-xxxx.onrender.com \
//     --mcp https://kb-policy-mcp-xxxx.onrender.com/mcp
//   ... --llm                                           # 실제 모델 호출까지 (토큰 사용, 끝나면 데이터 reset)
//
// 토큰은 셸 기록에 남지 않도록 인자 대신 환경변수(READ_TOKEN)로 받는다.
import "@kb/core/env";
import { connectToolbox } from "./agent/mcpClient.ts";

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const trim = (u: string) => u.replace(/\/+$/, "");

const service = trim(arg("service") || process.env.SERVICE_URL || `http://localhost:${process.env.SERVICE_PORT || 8787}`);
const mcp = trim(arg("mcp") || process.env.MCP_URL || "http://localhost:8788/mcp");
const readToken = process.env.READ_TOKEN
  || (process.env.MCP_TOKENS || "").split(",").map((e) => e.trim().split(":")).find(([, s]) => s === "read")?.[0];
const withLlm = args.includes("--llm");

const WRITE_TOOLS = ["create_ticket", "add_comment", "update_ticket_status", "link_policy_section", "propose_policy_change", "request_approval"];
let failed = 0;
const ok = (msg: string) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const bad = (msg: string, hint?: string) => {
  failed++;
  console.log(`\x1b[31m✗\x1b[0m ${msg}`);
  if (hint) console.log(`  \x1b[2m→ ${hint}\x1b[0m`);
};
const warn = (msg: string) => console.log(`\x1b[33m!\x1b[0m ${msg}`);

async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); } catch (err) { bad(`${name}: ${(err as Error).message}`); }
}

console.log(`service: ${service}\nmcp:     ${mcp}\n`);
if (!mcp.endsWith("/mcp")) warn("MCP 주소가 /mcp 로 끝나지 않습니다. 보통은 https://<mcp 주소>/mcp 입니다.");

// 1) 두 서버가 떠 있는가 (무료 플랜이면 첫 요청에 50초쯤 걸릴 수 있다)
await step("service 상태", async () => {
  const h = (await (await fetch(`${service}/api/health`)).json()) as { ok: boolean; llmMode: string; model: string };
  ok(`service 응답 (${h.llmMode} · ${h.model})`);
  if (h.llmMode === "replay") warn("LLM_MODE=replay 입니다. 라이브 시연이면 LLM_MODE 를 비우세요.");
});
await step("mcp 상태", async () => {
  const h = (await (await fetch(new URL("/health", mcp))).json()) as { descriptions: string };
  ok(`mcp 응답 (description ${h.descriptions})`);
});

// 2) 토큰 없는 요청은 거부되는가
await step("mcp 인증", async () => {
  const res = await fetch(mcp, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (res.status === 401) ok("토큰 없는 MCP 요청은 401 로 거부");
  else bad(`토큰 없는 요청이 ${res.status} 를 받았습니다 (401 이어야 함)`, "mcp 서비스의 MCP_TOKENS 확인");
});

// 3) service → mcp 연결 (service 의 MCP_URL, MCP_AGENT_TOKEN, MCP_TOKENS 와 mcp 의 MCP_TOKENS 가 맞물리는지)
await step("service → mcp", async () => {
  const res = await fetch(`${service}/api/internals/tools`);
  const body = (await res.json()) as { error?: string; tools?: { name: string; visibleToReadToken: boolean }[] };
  if (!res.ok || !body.tools) {
    bad(`service 가 MCP 에 붙지 못했습니다: ${body.error ?? res.status}`,
      "service 의 MCP_URL(끝에 /mcp), MCP_AGENT_TOKEN 이 mcp 의 MCP_TOKENS 에 propose 로 들어 있는지 확인");
    return;
  }
  const readable = body.tools.filter((t) => t.visibleToReadToken).length;
  if (body.tools.length === 11) ok(`에이전트 토큰으로 도구 ${body.tools.length}개`);
  else bad(`에이전트 도구가 ${body.tools.length}개입니다 (11개여야 함)`, "MCP_AGENT_TOKEN 의 권한이 propose 인지 확인");
  if (readable === 5) ok("service 가 아는 read 토큰으로 도구 5개");
  else bad(`read 토큰으로 보이는 도구가 ${readable}개입니다 (5개여야 함)`, "service 와 mcp 의 MCP_TOKENS 가 같은 값인지 확인");
});

// 4) 외주 개발자 입장: read 토큰으로 직접 붙어서 조회 (mcp → service 연결 = mcp 의 SERVICE_URL 확인)
await step("개발자(read 토큰) 조회", async () => {
  if (!readToken) { warn("READ_TOKEN 이 없어 개발자 연결 점검을 건너뜁니다."); return; }
  const box = await connectToolbox({ url: mcp, token: readToken }).catch((err: Error) => {
    bad(`read 토큰으로 MCP 에 연결하지 못했습니다: ${err.message.slice(0, 120)}`,
      /401|Bearer/.test(err.message) ? "READ_TOKEN 이 mcp 의 MCP_TOKENS 에 :read 로 들어 있는지 확인" : "MCP 주소 확인");
  });
  if (!box) return;
  try {
    const names = box.tools.map((t) => t.name);
    const leaked = names.filter((n) => WRITE_TOOLS.includes(n));
    if (leaked.length) bad(`read 토큰에 쓰기 도구가 보입니다: ${leaked.join(", ")}`, "MCP_TOKENS 에서 이 토큰이 :read 인지 확인");
    else ok(`read 토큰으로 조회 도구 ${names.length}개, 쓰기 도구 없음`);
    const r = await box.call("search_policies", { query: "14세 미만 가입" });
    const hits = r.ok ? ((JSON.parse(r.text) as { hits?: unknown[] }).hits?.length ?? 0) : 0;
    if (hits > 0) ok(`search_policies 결과 ${hits}건 (mcp → service 연결 정상)`);
    else bad(`search_policies 실패: ${r.text.slice(0, 120)}`, "mcp 의 SERVICE_URL 이 service 주소인지 확인 (끝에 / 없이)");
  } finally {
    await box.close();
  }
});

// 5) (선택) 실제 모델 호출: API 키 · 워크스페이스 · 에이전트 루프 전체
if (withLlm) {
  await step("모델 호출", async () => {
    const res = await fetch(`${service}/api/ask`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "회원 가입은 몇 살부터 할 수 있나요?" }),
    });
    if (!res.ok || !res.body) { bad(`/api/ask 가 ${res.status} 를 반환`); return; }
    // SSE 본문에서 "data: {...}" 줄만 이벤트로 읽는다 (run/end 같은 제어 이벤트는 type 이 없다)
    const events = (await res.text()).split("\n").filter((l) => l.startsWith("data: "))
      .map((l) => { try { return JSON.parse(l.slice(6)) as { type?: string; message?: string; retryable?: boolean }; } catch { return {}; } });
    const errors = events.filter((e) => e.type === "error" && !e.retryable).map((e) => e.message);
    const done = events.some((e) => e.type === "done");
    const tools = events.filter((e) => e.type === "tool_call").length;
    if (done && errors.length === 0) ok(`에이전트 실행 완료 (도구 호출 ${tools}회)`);
    else bad(`에이전트 실행 오류: ${errors.join(" / ") || "done 이벤트 없음"}`,
      "ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID 확인. 자세한 내용은 /internals 에서");
  });
  await step("데이터 초기화", async () => {
    const res = await fetch(`${service}/api/admin/reset`, { method: "POST" });
    if (res.ok) ok("점검용 실행을 지우고 시드 상태로 되돌림"); else bad(`reset 실패: ${res.status}`);
  });
} else {
  console.log("\x1b[2m  (모델 호출까지 보려면 --llm)\x1b[0m");
}

console.log(failed ? `\n\x1b[31m${failed}개 실패\x1b[0m` : "\n\x1b[32m모두 통과\x1b[0m");
process.exit(failed ? 1 : 0);
