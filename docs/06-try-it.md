# 06. 직접 해보기

## 5분 안에 띄우기

필요한 것: Node.js 22, pnpm (`corepack enable` 이면 자동), Anthropic API 키(없으면 리플레이 모드).

```bash
git clone <repo> && cd kb-agentic-workflow
corepack enable
pnpm install
cp .env.example .env          # ANTHROPIC_API_KEY 채우기
pnpm dev
```

| 주소 | |
|---|---|
| http://localhost:5173 | 웹 UI (개발 서버) |
| http://localhost:8787/api/health | service |
| http://localhost:8788/health | mcp |

키가 없으면: `.env` 에서 `LLM_MODE=replay` → 저장된 녹화로 데모 시나리오가 동작한다 ([04](04-observability.md#2-llm_modereplay-오프라인-시연)).

### 확인 순서

1. **터미널:** `pnpm ask "검진 전날 예약을 취소하면 어떻게 되나요?"` → 도구 호출과 인용이 보이면 성공.
2. **Q&A:** 예시 질문 "만 14세 미만 사용자는…" → 문서 간 모순 + 정책 공백 티켓.
3. **보드:** T-4 담당자를 🤖 Agent 로 → In Review 로 이동, 코멘트, 새 공백 티켓.
4. **정책서 갱신:** 공백 티켓에 결정 코멘트 → 에이전트에게 맡기기 → 변경안 승인.
5. **내 Claude Code 에 연결:** [02](02-mcp.md#claude-code) 의 `claude mcp add …` 후 정책을 물어보기.

초기화: 서버를 끄고 `pnpm seed:reset` (또는 서버를 켠 채 `curl -X POST localhost:8787/api/admin/reset`).

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|---|---|
| `ANTHROPIC_API_KEY 가 없습니다` | `.env` 확인. 또는 `LLM_MODE=replay` |
| 에이전트가 `MCP 서버에 연결할 수 없습니다` | mcp 서버가 안 떴거나 `MCP_URL` 이 틀림. `pnpm dev` 로그 확인 |
| 모든 도구 호출이 401 | `MCP_AGENT_TOKEN` 이 `MCP_TOKENS` 목록에 없음 |
| 리플레이에서 "fixture 가 없습니다" | 녹화와 다른 질문/순서. `pnpm seed:reset` 후 녹화 순서대로 |
| 티켓 번호가 녹화와 다름 | 시드 초기화 없이 시연함. `/api/admin/reset` |

## 실습: 도구 하나 추가하기

**목표:** `get_glossary_term` — 용어 하나의 정의를 돌려주는 read 도구. (지금은 resource 로만 있다)

### 1. service 에 API 추가

`apps/service/src/api/policies.ts`

```ts
app.get("/glossary/:term", (c) => {
  const term = c.req.param("term");
  const line = loadResource("glossary").split("\n").find((l) => l.startsWith(`| ${term} |`));
  if (!line) return c.json({ error: `용어 '${term}' 이(가) 용어집에 없습니다` }, 404);
  return c.json({ term, definition: line.split("|")[2]!.trim() });
});
```

### 2. MCP 도구 정의

`apps/mcp/src/tools/policy.ts`

```ts
export const getGlossaryTerm = defineTool({
  name: "get_glossary_term",
  title: "용어 정의",
  scope: "read",            // 누구에게 보일까?
  requiresApproval: false,  // 사람 승인이 필요한가?
  readOnly: true,
  input: { term: z.string().describe("용어. 예: '수검자'") },
  async handler({ term }) {
    const r = await service.get<{ term: string; definition: string }>(`/glossary/${encodeURIComponent(term)}`);
    return { summary: `${r.term}: ${r.definition}`, ...r };
  },
});
```

`policyTools` 배열에 추가한다.

### 3. description 쓰기

`descriptions/v1.ts`, `v2.ts` 둘 다에 넣는다 (빠뜨리면 mcp 서버가 시작할 때 어느 파일에 무엇이 없는지 에러로 알려준다).
v2 는 네 칸을 채운다: 무엇을 / 언제 / **쓰지 말 것** / 반환 형식.

생각해볼 것: `search_policies` 와 경계는? "용어 뜻을 물을 때는 이것, 규칙을 물을 때는 search_policies".

### 4. 확인

```bash
pnpm dev
```

- `/internals → MCP 도구` 에 12번째 도구가 보이는지, read 토큰에 "보임"인지.
- `pnpm ask "수검자가 뭐예요?"` → 에이전트가 새 도구를 고르는지.
- v1 description 으로 바꿔서도 해보기: `TOOL_DESCRIPTIONS=v1 pnpm dev`.

### 5. 더 해보기

- `scope: "propose"` 로 바꾸면 read 토큰에서 사라지는 것 확인.
- `requiresApproval: true` 로 바꾸면 타임라인에 ✋ 가 뜨는 것 확인 (루프 코드는 안 고쳤는데도).
- 시스템 프롬프트를 고치지 않고 description 만으로 도구 선택을 유도할 수 있는지 실험.

## Render 배포

`render.yaml` 에 Web Service 2개가 정의돼 있다 (Blueprint). DB 는 없다.

1. Render 에서 Blueprint 로 저장소 연결 → `kb-policy-service`, `kb-policy-mcp` 생성.
2. 환경변수 채우기 (값은 `.env.example` 참고):
   - mcp: `SERVICE_URL`(= service 주소), `MCP_TOKENS`(긴 난수 토큰)
   - service: `ANTHROPIC_API_KEY`, `MCP_URL`(= mcp 주소 + `/mcp`), `MCP_AGENT_TOKEN`, `MCP_TOKENS`(mcp 와 같은 값)
3. 주의:
   - `NODE_ENV=production` 을 설정하지 않는다 (devDependencies 인 vite 가 빠져 웹 빌드 실패).
   - 상태(`data/store.json`)는 재배포/재시작 때 시드로 초기화된다.
   - free 플랜은 유휴 시 잠든다. 발표 직전에 두 서비스를 한 번씩 깨워 둔다.
