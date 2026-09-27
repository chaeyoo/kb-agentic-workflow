# 04. 관측성 — 이벤트 스트림, AgentRun, 리플레이

## 이벤트가 공통 언어

루프는 이벤트만 내보낸다 ([01](01-agent-loop.md#이벤트)). 같은 이벤트를 여러 곳이 소비한다.

```mermaid
flowchart LR
  L[loop.ts emit] --> R[runner.ts]
  R -->|t 붙여 저장| DB[(AgentRun.events)]
  R -->|실시간| SSE[GET /api/runs/:id/stream]
  SSE --> UI[웹 타임라인]
  SSE --> CLI[pnpm ask]
  DB --> INT[/internals]
  DB --> FX[fixtures/runs → LLM_MODE=replay]
  DB --> RP[화면 리플레이]
```

- **SSE 구독은 지난 이벤트부터 다시 보낸다.** 새로고침하거나 늦게 들어와도 처음부터 보인다.
- 클라이언트는 `done` 을 받으면 연결을 먼저 닫는다 (안 닫으면 EventSource 가 자동 재연결해 같은 이벤트를 또 받는다).

## AgentRun 기록

실행 하나 = 레코드 하나 (`data/store.json` 의 `runs`).

| 필드 | 내용 |
|---|---|
| `trigger` | `qa` / `cli` / `ticket(T-5)` |
| `input` | 모델에게 준 첫 메시지 원문 (질문 또는 티켓 작업 지시) |
| `model` | 모델 id, 리플레이면 `replay (…)` |
| `toolDescriptionVersion` | v1 / v2 — 실험 비교용 |
| `events` | 모든 이벤트 + `t` (실행 시작 기준 ms) |
| `tokenUsage` | 입력 / 캐시 읽기 / 출력 토큰 합계 |
| `durationMs`, `status`, `answer` | |

연결 고리:
- 에이전트가 남긴 코멘트에는 `runId` 가 붙는다 → 카드 상세에서 그 실행의 타임라인으로 바로 간다.
- 변경안에는 `sourceRunId` 가 붙는다.
- Q&A 는 `QaSession` 에 질문, 답변, 인용(섹션@버전), 근거 없음 여부가 남는다.

## /internals 페이지

발표 중 "안에서 무슨 일이 일어나는지"를 보여주는 화면.

- **상단 통계:** 실행 수, 실패, 도구 호출 수, 토큰 합계.
- **실행 기록:** 트리거, 소요 시간, 호출한 도구, 토큰 → 선택하면 입력 프롬프트 원문, 최종 답변, 타임라인.
- **MCP 도구:** service 가 실제로 `listTools` 를 호출한 결과(= 모델이 보는 것), 권한, 승인 필요 여부, read 토큰 노출 여부, description v1/v2 비교.

## 리플레이 — 두 종류

### 1) 화면 리플레이 (기록 다시 보기)

`/internals` → 실행 선택 → **▶ 원래 속도로 다시 보기** (0.5x ~ 4x).
저장된 이벤트를 `t` 간격대로 다시 그린다. 긴 대기는 1.5초로 자른다. 서버도 모델도 호출하지 않는다.

### 2) LLM_MODE=replay (오프라인 시연)

**발표 당일 네트워크/API 장애 대비.** 녹화해 둔 실행에서 "모델이 매 턴 무엇을 답했는지"를 복원해 Anthropic API 대신 재생한다.

- **모델 호출만 가짜다. 도구는 진짜로 MCP 서버를 거쳐 실행된다** → 티켓이 생기고 정책서가 실제로 바뀐다. 청중이 보기에 라이브와 같다.
- 어떤 녹화를 쓸지는 **입력 문자열**이 같은지로 고른다. 같은 입력이 여러 개면(T-5 수정요청 후 재실행) 녹화 순서대로 쓴다.
- 도구 입력에 티켓·변경안 번호가 들어 있으므로, **시드 초기화 후 녹화한 순서대로** 시연해야 번호가 맞는다.
- 상단 배지가 `📼 REPLAY 모드` 로 바뀐다. 토큰은 0 으로 기록된다.

구현: [`apps/service/src/agent/replay.ts`](../apps/service/src/agent/replay.ts) — 이벤트에서 턴 복원(`turnsFromEvents`), 재생(`replayTurn`).
`llm.ts` 의 `callModel` 이 모드에 따라 분기할 뿐, 루프 코드는 리플레이를 모른다.

### fixture 녹화하기 (발표 전 필수)

`fixtures/runs/` 에 들어 있는 4개는 **스크립트로 만든 샘플**이다 (`model: scripted-sample`). 실제 키로 다시 녹화해 덮어쓴다.

```bash
pnpm seed:reset                    # 서버를 끈 상태에서
pnpm dev                           # LLM_MODE=live, 실제 키
# 데모 순서대로 진행 (docs/07-demo-rehearsal.md)
#   1. Q&A "만 14세 미만 사용자는 검진 예약을 스스로 할 수 있나요?"
#   2. T-4 담당자 → Agent
#   3. T-5 에 결정 코멘트 → 에이전트에게 맡기기
#   4. P-1 수정요청 → (자동 재실행) → P-2 승인
# /internals 에서 각 실행 → "📼 리플레이 fixture 로 저장"
#   이름: 01-qa-minor-booking, 02-ticket-T-4-research, 03-ticket-T-5-propose, 04-ticket-T-5-revise
```

API 로도 저장할 수 있다: `curl -X POST localhost:8787/api/runs/run-3/fixture -H 'content-type: application/json' -d '{"name":"03-ticket-T-5-propose"}'`

리플레이로 시연:

```bash
pnpm seed:reset
LLM_MODE=replay pnpm dev           # REPLAY_SPEED=2 로 두 배 빠르게
```

녹화와 다른 흐름이 되면(다른 질문, 다른 순서) 해당 실행이 "fixture 가 없습니다" 에러로 실패한다. 그 경우 화면 리플레이로 보여준다.
