// LLM 호출부. 에이전트 루프가 "모델에게 한 번 물어보기"를 할 때 쓰는 함수 하나만 제공한다.
// - 스트리밍으로 받아 thinking / text 조각을 콜백으로 흘려보낸다
// - 일시적 오류(429, 5xx, 네트워크)는 여기서 재시도하고, 재시도 사실을 이벤트로 알린다
//   (SDK 내장 재시도를 끄고 직접 하는 이유: 타임라인에 "재시도"가 보이게 하려고)
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.LLM_MODEL || "claude-sonnet-5";
const EFFORT = (process.env.LLM_EFFORT || "medium") as "low" | "medium" | "high";
const MAX_ATTEMPTS = 3;

let client: Anthropic | undefined;
function getClient(): Anthropic {
  // 키는 ANTHROPIC_API_KEY 환경변수에서 SDK 가 알아서 읽는다.
  client ??= new Anthropic({ maxRetries: 0 });
  return client;
}

export interface TurnInput {
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
}

export interface TurnHandlers {
  onThinking: (delta: string) => void;
  onText: (delta: string) => void;
  onRetry: (message: string, attempt: number) => void;
}

function isRetryable(err: unknown): boolean {
  return err instanceof Anthropic.RateLimitError
    || err instanceof Anthropic.InternalServerError
    || err instanceof Anthropic.APIConnectionError;
}

/** 모델에게 한 턴을 요청하고, 완성된 응답(Message)을 돌려준다. */
export async function callModel(input: TurnInput, h: TurnHandlers): Promise<Anthropic.Message> {
  for (let attempt = 1; ; attempt++) {
    try {
      const stream = getClient().messages.stream({
        model: MODEL,
        max_tokens: 16000,
        system: input.system,
        tools: input.tools,
        messages: input.messages,
        thinking: { type: "adaptive", display: "summarized" }, // 요약된 사고 과정을 받아 타임라인에 보여준다
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" }, // tools + system 은 매 턴 같으므로 캐시된다
      });
      stream.on("thinking", (delta) => h.onThinking(delta));
      stream.on("text", (delta) => h.onText(delta));
      return await stream.finalMessage();
    } catch (err) {
      if (!isRetryable(err) || attempt >= MAX_ATTEMPTS) throw err;
      const wait = 1000 * 2 ** (attempt - 1);
      h.onRetry(`${(err as Error).message} — ${wait / 1000}초 후 재시도 (${attempt}/${MAX_ATTEMPTS - 1})`, attempt);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
