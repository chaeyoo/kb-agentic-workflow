// 에이전트 실행 관리: AgentRun 기록 + 실시간 구독(SSE) 지원.
//
// 루프(loop.ts)는 이벤트를 emit 할 뿐이고, 여기서 그 이벤트를
//   1) AgentRun.events 에 시각(t)과 함께 저장하고  → 리플레이/internals 의 원천
//   2) 지금 보고 있는 구독자(SSE)에게 전달한다      → 실시간 타임라인
import { EventEmitter } from "node:events";
import type { AgentEvent, AgentRun, Citation, FileStore, QaSession, RecordedEvent } from "@kb/core";
import { runAgentLoop } from "./loop.ts";
import { connectToolbox } from "./mcpClient.ts";
import { MODEL_LABEL } from "./llm.ts";
import { SYSTEM_PROMPT, ticketTaskPrompt } from "./systemPrompt.ts";

export type RunListener = (event: RecordedEvent) => void;

export class AgentRunner {
  private live = new Map<string, EventEmitter>();

  constructor(private store: FileStore) {}

  /** 실행을 시작하고 runId 를 바로 돌려준다. 실행은 백그라운드에서 계속된다. */
  start(input: string, trigger: AgentRun["trigger"]): { runId: string; finished: Promise<AgentRun> } {
    const run: AgentRun = {
      id: this.store.nextId("run"),
      trigger,
      input,
      model: MODEL_LABEL,
      toolDescriptionVersion: process.env.TOOL_DESCRIPTIONS || "v2",
      events: [],
      status: "running",
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      startedAt: new Date().toISOString(),
    };
    this.store.data.runs.push(run);
    this.store.save();

    const bus = new EventEmitter();
    this.live.set(run.id, bus);
    const t0 = Date.now();
    const emit = (e: AgentEvent) => {
      const rec = { ...e, t: Date.now() - t0 } as RecordedEvent;
      run.events.push(rec);
      bus.emit("event", rec);
    };

    const finished = (async () => {
      let toolbox;
      try {
        toolbox = await connectToolbox({ runId: run.id });
        const result = await runAgentLoop({ system: SYSTEM_PROMPT, input, toolbox, emit });
        run.status = "completed";
        run.answer = result.answer;
        run.tokenUsage = result.usage;
        if (trigger.kind === "qa" || trigger.kind === "cli") this.recordQa(run);
      } catch (err) {
        run.status = "failed";
        emit({ type: "error", message: (err as Error).message });
        emit({ type: "done", answer: "", stopReason: "error" });
      } finally {
        await toolbox?.close().catch(() => {});
        run.durationMs = Date.now() - t0;
        this.store.save();
        bus.emit("end");
        this.live.delete(run.id);
      }
      return run;
    })();

    return { runId: run.id, finished };
  }

  /** 티켓 작업 실행. 담당자를 Agent 로 바꾸면 호출된다. */
  startTicketRun(ticketId: string): string {
    return this.start(ticketTaskPrompt(ticketId), { kind: "ticket", ticketId }).runId;
  }

  isTicketRunning(ticketId: string): boolean {
    return this.store.data.runs.some((r) =>
      r.status === "running" && r.trigger.kind === "ticket" && r.trigger.ticketId === ticketId && this.live.has(r.id));
  }

  /**
   * 실행 이벤트를 구독한다. 이미 지나간 이벤트부터 먼저 보내고, 진행 중이면 이어서 보낸다.
   * (브라우저가 중간에 접속해도 처음부터 타임라인을 볼 수 있다)
   */
  subscribe(runId: string, onEvent: RunListener, onEnd: () => void): () => void {
    const run = this.store.data.runs.find((r) => r.id === runId);
    if (!run) { onEnd(); return () => {}; }
    run.events.forEach(onEvent);
    const bus = this.live.get(runId);
    if (!bus) { onEnd(); return () => {}; }
    bus.on("event", onEvent);
    bus.once("end", onEnd);
    return () => { bus.off("event", onEvent); bus.off("end", onEnd); };
  }

  /** Q&A 실행이면 질문/답변/인용을 QaSession 으로 남긴다. */
  private recordQa(run: AgentRun): void {
    const answer = run.answer ?? "";
    const qa: QaSession = {
      id: this.store.nextId("qa"),
      question: run.input,
      answer,
      citations: parseCitations(answer),
      noEvidence: /판정:\s*(근거 부족|문서 간 모순)/.test(answer),
      runId: run.id,
      createdAt: new Date().toISOString(),
    };
    this.store.data.qaSessions.push(qa);
  }
}

/** 답변 속 [[membership.age@2]] 형식의 인용을 뽑는다. */
export function parseCitations(text: string): Citation[] {
  const seen = new Map<string, Citation>();
  for (const m of text.matchAll(/\[\[([\w.-]+)@(\d+)\]\]/g)) {
    const sectionId = `${m[1]}@${m[2]}`;
    seen.set(sectionId, { sectionId, sectionKey: m[1]!, version: Number(m[2]) });
  }
  return [...seen.values()];
}
