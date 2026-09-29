import type { Env } from "./env";
import { TOOL_DEFS, type ToolContext, runTool } from "./tools";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatResponse {
  choices?: { message: ChatMessage; finish_reason?: string }[];
  error?: { message?: string };
}

export type FetchLike = typeof fetch;

const MAX_ITERATIONS = 5;
const REQUEST_TIMEOUT_MS = 15_000;

async function callOpenRouter(env: Env, messages: ChatMessage[], doFetch: FetchLike): Promise<ChatMessage> {
  const res = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Dokon AI sotuvchi",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages,
      tools: TOOL_DEFS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 900,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as ChatResponse;
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error(`OpenRouter bo'sh javob: ${data.error?.message ?? "noma'lum"}`);
  return msg;
}

/**
 * Tool-calling tsikli: model tool so'rasa bajaramiz va natijani qaytaramiz,
 * matnli javob kelguncha (ko'pi bilan MAX_ITERATIONS marta).
 */
export async function runAgent(
  ctx: ToolContext,
  system: string,
  history: { role: "user" | "assistant"; content: string }[],
  userText: string,
  doFetch: FetchLike = fetch,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const msg = await callOpenRouter(ctx.env, messages, doFetch);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      const text = (msg.content ?? "").trim();
      if (!text) throw new Error("Model matnsiz javob qaytardi");
      return text;
    }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let result: unknown;
      try {
        const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        result = await runTool(ctx, call.function.name, args);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  throw new Error("Tool tsikli juda uzun bo'ldi");
}
