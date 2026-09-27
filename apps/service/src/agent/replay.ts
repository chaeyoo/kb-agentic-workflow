// 리플레이 모드 (LLM_MODE=replay) — 발표 당일 네트워크/API 장애 대비.
//
// 녹화해 둔 AgentRun 의 이벤트(fixtures/runs/*.json)에서 "모델이 매 턴 무엇을 답했는지"를 복원해서,
// Anthropic API 대신 그 응답을 원래 속도로 흘려준다.
//   - 모델 호출만 가짜다. 도구 호출은 진짜로 MCP 서버를 거쳐 실행된다 → 보드/정책서가 실제로 바뀐다.
//   - 어떤 fixture 를 쓸지는 입력(질문 또는 티켓 작업 지시) 문자열이 같은지로 고른다.
//     같은 입력의 fixture 가 여러 개면(예: 수정요청 후 재실행) 녹화 순서대로 하나씩 쓴다.
//   - 도구 입력에 티켓/변경안 번호가 들어 있으므로, `pnpm seed:reset` 후 녹화한 순서대로 시연해야 번호가 맞는다.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentRun, RecordedEvent } from "@kb/core";

export const FIXTURES_DIR = process.env.FIXTURES_DIR
  || fileURLToPath(new URL("../../../../fixtures/runs", import.meta.url));
const SPEED = Number(process.env.REPLAY_SPEED || 1); // 2 = 두 배 빠르게
const MAX_GAP_MS = 2500; // 녹화 중 오래 걸린 구간도 이 이상은 기다리지 않는다

export interface Fixture {
  name: string;
  note?: string;
  recordedAt: string;
  model: string;
  trigger: AgentRun["trigger"];
  input: string;
  events: RecordedEvent[];
}

/** 녹화된 이벤트에서 복원한 모델의 한 턴 */
interface Turn {
  deltas: { kind: "thinking" | "text"; text: string; t: number }[];
  toolCalls: { id: string; name: string; input: unknown; t: number }[];
  startT: number; // 이 턴을 요청한 시각 (직전 도구 결과가 나온 시각)
  stopReason: string;
}

export function turnsFromEvents(events: RecordedEvent[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | undefined;
  let lastToolResultT = 0;
  let afterTools = false;
  for (const e of events) {
    const startNew = () => {
      cur = { deltas: [], toolCalls: [], startT: lastToolResultT, stopReason: "end_turn" };
      turns.push(cur);
      afterTools = false;
    };
    if (e.type === "thinking" || e.type === "message_delta") {
      if (!cur || afterTools) startNew();
      cur!.deltas.push({ kind: e.type === "thinking" ? "thinking" : "text", text: e.text, t: e.t });
    } else if (e.type === "tool_call") {
      if (!cur || afterTools) startNew();
      cur!.toolCalls.push({ id: e.id, name: e.name, input: e.input, t: e.t });
      cur!.stopReason = "tool_use";
    } else if (e.type === "tool_result") {
      lastToolResultT = e.t;
      afterTools = true;
    } else if (e.type === "done" && cur && !afterTools) {
      cur.stopReason = e.stopReason;
    }
  }
  return turns;
}

// --- fixture 저장/불러오기 ---------------------------------------------------

export function saveFixture(run: AgentRun, name: string): string {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const safe = name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || run.id;
  const fixture: Fixture = {
    name: safe, recordedAt: run.startedAt, model: run.model, trigger: run.trigger, input: run.input, events: run.events,
  };
  const file = join(FIXTURES_DIR, `${safe}.json`);
  writeFileSync(file, JSON.stringify(fixture, null, 2));
  cache = undefined;
  return file;
}

let cache: Fixture[] | undefined;
const used = new Map<string, number>(); // 입력별로 몇 번째 fixture 까지 썼는가

export function listFixtures(): Fixture[] {
  if (!cache) {
    cache = existsSync(FIXTURES_DIR)
      ? readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort()
        .map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Fixture)
      : [];
  }
  return cache;
}

/** 실행 하나가 시작될 때 호출: 이 입력에 쓸 fixture 를 하나 고른다. */
export function claimFixture(input: string): Fixture {
  const matches = listFixtures().filter((f) => f.input.trim() === input.trim());
  if (matches.length === 0) {
    throw new Error(`리플레이할 fixture 가 없습니다. 이 입력으로 녹화된 실행이 fixtures/runs 에 없습니다: "${input.slice(0, 40)}…"`);
  }
  const n = used.get(input) ?? 0;
  used.set(input, n + 1);
  return matches[n % matches.length]!;
}

export function resetReplayCursor() { used.clear(); }

// --- 재생 --------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.min(MAX_GAP_MS, Math.max(0, ms)) / SPEED));

/** 녹화된 턴 하나를, 모델이 실제로 답하는 것처럼 흘려보내고 Message 로 돌려준다. */
export async function replayTurn(
  fixture: Fixture,
  turnIndex: number,
  h: { onThinking: (d: string) => void; onText: (d: string) => void },
): Promise<Anthropic.Message> {
  const turn = turnsFromEvents(fixture.events)[turnIndex];
  if (!turn) throw new Error(`fixture "${fixture.name}" 에 ${turnIndex + 1}번째 턴이 없습니다 (녹화와 다른 흐름으로 진행됨)`);

  let prevT = turn.startT;
  let thinking = "";
  let text = "";
  for (const d of turn.deltas) {
    await sleep(d.t - prevT);
    prevT = d.t;
    if (d.kind === "thinking") { thinking += d.text; h.onThinking(d.text); } else { text += d.text; h.onText(d.text); }
  }
  if (turn.toolCalls[0]) await sleep(turn.toolCalls[0].t - prevT);

  const content = [
    ...(thinking ? [{ type: "thinking", thinking, signature: "replay" }] : []),
    ...(text ? [{ type: "text", text, citations: null }] : []),
    ...turn.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input })),
  ];
  // 필요한 필드만 채운 합성 응답. 토큰은 쓰지 않았으므로 0 으로 기록된다.
  return {
    id: `replay_${fixture.name}_${turnIndex}`,
    type: "message",
    role: "assistant",
    model: `replay:${fixture.model}`,
    content,
    stop_reason: turn.stopReason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}
