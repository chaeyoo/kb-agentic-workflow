# 08. Render 배포

`render.yaml`(Blueprint)에 서비스 2개가 정의되어 있다. Render 에서는 저장소를 연결하고 환경변수만 채우면 된다.

| 서비스 | 하는 일 |
|---|---|
| `kb-policy-service` | REST API, 에이전트 루프, 웹 UI(빌드 결과를 같이 서빙) |
| `kb-policy-mcp` | 원격 MCP 서버. 도구 실행은 service REST API 를 호출 |

## 0. 준비

토큰 2개를 새로 만든다. `dev-read-token`, `dev-agent-token` 은 저장소에 적힌 값이라 배포본에 쓰지 않는다.

```bash
openssl rand -hex 24   # read 토큰 (외주 개발자 · 발표용 Claude Code)
openssl rand -hex 24   # propose 토큰 (에이전트)
```

그 밖에 `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID` (로컬 `.env` 와 같은 값).

## 1. Blueprint 생성

1. Render 대시보드 → **New → Blueprint**
2. 저장소 `chaeyoo/kb-agentic-workflow`, 브랜치 `main`
3. 서비스 2개가 뜬다. 환경변수 입력 화면이 나오면 아는 값만 넣고 진행한다 (주소는 생성 후에 알 수 있다).

## 2. 환경변수

서비스가 생성되면 각 서비스의 **Environment** 탭에서 채운다.

**kb-policy-service**

| 키 | 값 |
|---|---|
| `ANTHROPIC_API_KEY` | API 키 |
| `ANTHROPIC_WORKSPACE_ID` | 워크스페이스 ID (없으면 400 에러) |
| `MCP_URL` | `https://<mcp 주소>/mcp` (끝에 `/mcp`) |
| `MCP_AGENT_TOKEN` | propose 토큰 |
| `MCP_TOKENS` | `<read토큰>:read:외주개발자,<propose토큰>:propose:policy-agent` |
| `LLM_MODEL` | 비우면 `claude-sonnet-5` |
| `LLM_EFFORT`, `LLM_MODE`, `REPLAY_SPEED`, `TOOL_DESCRIPTIONS` | 비워 둔다 |

**kb-policy-mcp**

| 키 | 값 |
|---|---|
| `SERVICE_URL` | `https://<service 주소>` (끝에 `/` 없이) |
| `MCP_TOKENS` | service 와 같은 값 |
| `TOOL_DESCRIPTIONS` | 비워 둔다 (기본 v2) |

`NODE_ENV=production` 은 넣지 않는다. devDependencies(vite)가 설치되지 않아 웹 빌드가 실패한다.

저장하면 두 서비스가 재배포된다. 둘 다 **Live** 가 될 때까지 기다린다.

## 3. 점검

로컬에서 실행한다. 토큰은 셸 기록에 남지 않게 환경변수로 넘긴다.

```bash
read -s READ_TOKEN && export READ_TOKEN        # read 토큰 붙여넣기
pnpm check:deploy \
  --service https://<service 주소> \
  --mcp https://<mcp 주소>/mcp
```

확인하는 것:

| 항목 | 실패하면 볼 곳 |
|---|---|
| 두 서버 응답, LIVE/REPLAY 모드 | 서비스가 잠들어 있으면 1분 뒤 다시 |
| 토큰 없는 MCP 요청이 401 | mcp 의 `MCP_TOKENS` |
| service → mcp 연결, 에이전트 도구 11개 | service 의 `MCP_URL`, `MCP_AGENT_TOKEN` |
| read 토큰 도구 5개 (쓰기 도구 없음) | 두 서비스의 `MCP_TOKENS` 가 같은지 |
| read 토큰으로 `search_policies` 결과 | mcp 의 `SERVICE_URL` |

실제 모델 호출까지 확인하려면 `--llm` 을 붙인다. 질문 하나를 돌려 보고, 끝나면 `/api/admin/reset` 으로 데이터를 시드로 되돌린다.

```bash
pnpm check:deploy --service ... --mcp ... --llm
```

## 4. 개발자 Claude Code 연결

```bash
claude mcp remove kb-policy    # 로컬 연결을 해 뒀다면
claude mcp add --transport http kb-policy https://<mcp 주소>/mcp \
  --header "Authorization: Bearer <read 토큰>"
```

## 5. 배포본 리허설

[07](07-demo-rehearsal.md) 순서대로 한 번 끝까지 돌린 뒤 초기화한다.

```bash
curl -X POST https://<service 주소>/api/admin/reset
```

## 알아 둘 것

- **잠자기:** 무료 플랜은 15분 동안 요청이 없으면 잠들고, 깨어나는 데 50초 정도 걸린다. 발표 5분 전에 두 주소를 열어 둔다.
- **데이터 초기화:** 잠들거나 재배포되면 `store.json` 이 시드로 돌아간다. 데모 도중 15분 넘게 요청이 없으면 중간 결과가 사라질 수 있다.
- **REST API 는 인증이 없다:** 데이터가 모두 가상이라 데모에는 문제없지만, service 주소를 공개 채널에 올리지 않는다. MCP 는 토큰이 없으면 거부한다.
