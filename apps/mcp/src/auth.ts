// Bearer 토큰 인증과 권한(scope).
//
//   MCP_TOKENS="dev-read-token:read,dev-agent-token:propose"
//
// - read    : 조회 도구만 보인다. 외주 개발자에게 발급하는 토큰.
// - propose : 조회 + 티켓 작성 + 정책 변경"안" 제안. 우리 에이전트가 쓰는 토큰.
// 어느 토큰도 정책 문서를 "직접" 고칠 수 없다. 그런 도구 자체가 없다.
export type Scope = "read" | "propose";

export interface Caller {
  token: string;
  scope: Scope;
  label: string; // 로그/코멘트에 남길 호출자 이름
}

function parseTokens(): Map<string, Caller> {
  const map = new Map<string, Caller>();
  for (const entry of (process.env.MCP_TOKENS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [token, scope = "read", label] = entry.split(":");
    if (!token || (scope !== "read" && scope !== "propose")) {
      throw new Error(`MCP_TOKENS 형식 오류: "${entry}" (token:read 또는 token:propose[:이름])`);
    }
    map.set(token, { token, scope, label: label || (scope === "propose" ? "policy-agent" : "reader") });
  }
  return map;
}

const tokens = parseTokens();
if (tokens.size === 0) console.warn("[mcp] MCP_TOKENS 가 비어 있습니다. 모든 요청이 401 로 거부됩니다.");

export function authenticate(header: string | undefined): Caller | undefined {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m ? tokens.get(m[1]!.trim()) : undefined;
}

export function canUse(caller: Caller, required: Scope): boolean {
  return required === "read" || caller.scope === "propose";
}
