# 도메인 정책 에이전트 워크플로우

도메인을 모르는 개발자가 **정책을 묻고 → 근거와 함께 답을 받고 → 정책 공백은 티켓이 되고 → 개발 중 결정된 내용이 사람 승인을 거쳐 정책서에 반영되는** 흐름을 에이전트로 만든 데모입니다.
정책 지식은 **원격 MCP 서버**로 노출해서, 우리 에이전트와 외주 개발자의 AI 코딩 도구(Claude Code, Cursor)가 **같은 서버**를 씁니다.

> 모든 정책 문서는 가상의 헬스케어 앱을 위해 지어낸 데이터입니다. 실제 회사 정책이 아닙니다.

```
apps/service   REST API + 에이전트 루프 + (웹 UI)      :8787
apps/mcp       원격 MCP 서버 (Streamable HTTP, Bearer) :8788
packages/core  도메인 모델, 파일 저장소, 검색, 시드
docs/          팀 설명용 문서
```

## 빠르게 띄우기

```bash
pnpm install
cp .env.example .env        # ANTHROPIC_API_KEY 만 채운다
pnpm dev                    # service + mcp 동시 기동

# 다른 터미널에서
pnpm ask "만 14세 미만 사용자는 검진 예약을 스스로 할 수 있나요?"
pnpm ask --verbose "..."    # 도구 결과 원문까지 출력
```

상태는 `data/store.json` 파일 하나에 저장됩니다 (DB 없음). 시드로 되돌리려면 서버를 끄고 `pnpm seed:reset`.

## 내 AI 코딩 도구에 MCP 연결하기

Claude Code:

```bash
claude mcp add --transport http kb-policy http://localhost:8788/mcp \
  --header "Authorization: Bearer dev-read-token"
```

`dev-read-token` 은 읽기 전용 토큰이라 조회 도구만 보입니다. 자세한 내용은 `docs/02-mcp.md` (작성 예정).

## 문서

- `docs/05-build-log.md` — 만들어가는 순서와 결정 기록
