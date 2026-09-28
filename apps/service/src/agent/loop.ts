// ============================================================================
//  에이전트 루프 — 프레임워크 없이, 이게 전부다.
//
//  에이전트 = "모델에게 묻고 → 모델이 도구를 달라고 하면 실행해서 결과를 돌려주고 → 반복"
//  모델이 더 이상 도구를 달라고 하지 않으면(= 최종 답을 쓰면) 끝난다.
//
//  이 파일은 "무엇을 할지"만 담당한다.
//    - 모델 호출(스트리밍, 재시도)       → llm.ts
//    - 도구 목록/호출(MCP 클라이언트)    → mcpClient.ts
//    - 실행 기록 저장(AgentRun)          → runner.ts
//  루프는 진행 상황을 이벤트(emit)로 내보낼 뿐, 화면을 직접 그리지 않는다.
//  CLI 든 웹 UI 든 리플레이든, 이벤트만 받아서 그린다.
// ============================================================================
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent, TokenUsage } from "@kb/core";
import { callModel } from "./llm.ts";
import type { Toolbox } from "./mcpClient.ts";

export interface LoopOptions {
  system: string; // 시스템 프롬프트 (역할과 답변 원칙)
  input: string; // 사용자 질문 또는 작업 지시
  toolbox: Toolbox; // MCP 서버에서 받아온 도구들
  emit: (event: AgentEvent) => void; // 이벤트를 내보낼 곳
  maxTurns?: number; // 무한 루프 방지용 상한
}

export interface LoopResult {
  answer: string;
  stopReason: string;
  usage: TokenUsage;
}

export async function runAgentLoop(opts: LoopOptions): Promise<LoopResult> {
  const { system, input, toolbox, emit, maxTurns = 12 } = opts;

  // ① 대화 기록. 모델은 기억이 없으므로, 매 턴 지금까지의 대화 전체를 다시 보낸다.
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: input }];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  for (let turn = 1; turn <= maxTurns; turn++) {
    // ② 모델에게 묻는다. 도구 목록을 함께 주면, 모델이 "이 도구를 이 인자로 불러줘"라고 답할 수 있다.
    //    생각(thinking)과 답변(text)은 만들어지는 대로 흘려보낸다.
    const message = await callModel(
      { system, tools: toolbox.tools, messages },
      {
        onThinking: (text) => emit({ type: "thinking", text }),
        onText: (text) => emit({ type: "message_delta", text }),
        onRetry: (msg) => emit({ type: "error", message: msg, retryable: true }),
      },
    );
    usage.inputTokens += message.usage.input_tokens + (message.usage.cache_creation_input_tokens ?? 0);
    usage.outputTokens += message.usage.output_tokens;
    usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;

    // ③ 모델의 응답을 대화 기록에 붙인다 (thinking 블록 포함, 수정하지 않고 그대로).
    messages.push({ role: "assistant", content: message.content });

    // ④ 도구 요청이 없으면 = 최종 답변. 루프 종료.
    const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      const answer = textOf(message);
      if (message.stop_reason === "max_tokens") emit({ type: "error", message: "답변이 길이 제한에서 잘렸습니다" });
      if (message.stop_reason === "refusal") emit({ type: "error", message: "모델이 요청을 거절했습니다" });
      emit({ type: "done", answer, stopReason: message.stop_reason ?? "unknown" });
      return { answer, stopReason: message.stop_reason ?? "unknown", usage };
    }

    // ⑤ 모델이 요청한 도구를 실행한다. 실제 실행은 MCP 서버가 한다 — 여기서는 호출만.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      emit({ type: "tool_call", id: call.id, name: call.name, input: call.input, turn });
      const started = Date.now();
      const result = await toolbox.call(call.name, call.input);
      emit({
        type: "tool_result", id: call.id, name: call.name, ok: result.ok,
        summary: summarize(result.text), output: result.text, durationMs: Date.now() - started,
      });

      // ⑥ 사람 승인이 필요한 도구(requiresApproval)라면, 도구는 "승인 대기" 상태만 만들었을 뿐이다.
      //    실제 반영은 사람이 UI 에서 승인할 때 일어난다. 루프는 그 사실을 알리고 계속 진행한다.
      if (result.ok && toolbox.requiresApproval(call.name)) {
        emit({
          type: "approval_required", toolName: call.name,
          proposalId: extractProposalId(result.text),
          message: "사람의 승인이 있어야 반영됩니다",
        });
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: result.text, is_error: !result.ok });
    }

    // ⑦ 도구 결과를 "사용자 메시지"로 붙여서 다시 ②로. 모델은 결과를 보고 다음 행동을 정한다.
    //    (병렬 호출된 도구의 결과는 반드시 한 메시지에 모아서 돌려준다)
    messages.push({ role: "user", content: results });
  }

  // ⑧ 상한에 도달. 추측으로 마무리하지 않고 실패로 끝낸다 → 사람이 넘겨받는다.
  const message = `도구 호출이 ${maxTurns}턴을 넘어 중단했습니다. 사람의 확인이 필요합니다.`;
  emit({ type: "error", message });
  emit({ type: "done", answer: message, stopReason: "max_turns" });
  return { answer: message, stopReason: "max_turns", usage };
}

// --- 작은 도우미들 ----------------------------------------------------------

function textOf(message: Anthropic.Message): string {
  return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

/** 타임라인에 보여줄 한 줄 요약. 도구가 JSON 에 summary 필드를 넣어주면 그걸 쓴다. */
function summarize(text: string): string {
  try {
    const parsed = JSON.parse(text) as { summary?: unknown };
    if (typeof parsed.summary === "string") return parsed.summary;
  } catch { /* JSON 이 아니면 앞부분을 자른다 */ }
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function extractProposalId(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { proposalId?: unknown };
    return typeof parsed.proposalId === "string" ? parsed.proposalId : undefined;
  } catch { return undefined; }
}
