import {
  buildPrompt,
  type GenerateRequest,
  type GenerateResponse,
  type ValidationIssue,
  validateGenerateResponse,
} from "@slayply/core";
import type { GenerateChunk, ProviderAdapter, ProviderMessage } from "./types.js";

export type GenerationResult =
  | { ok: true; response: GenerateResponse; attempts: 1 | 2 }
  /** Both attempts failed validation; `rawText` is the last reply, for the "show raw text" fallback. */
  | { ok: false; rawText: string; issues: ValidationIssue[] };

const FENCE = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i;

/** Models sometimes wrap JSON in a fence despite instructions; unwrap exactly one fence. */
export function stripCodeFence(text: string): string {
  const match = FENCE.exec(text.trim());
  return match?.[1] ?? text;
}

async function collect(
  chunks: AsyncIterable<GenerateChunk>,
  onDelta: ((text: string) => void) | undefined,
): Promise<string> {
  let text = "";
  for await (const chunk of chunks) {
    if (chunk.type === "done") break;
    text += chunk.text;
    onDelta?.(chunk.text);
  }
  return text;
}

/**
 * Generates and validates a reply: one attempt, then at most one repair retry (SPEC §6).
 * `onDelta` receives the first attempt's text as it streams; the retry is not streamed.
 */
export async function generateValidated(
  adapter: ProviderAdapter,
  request: GenerateRequest,
  apiKey: string,
  signal: AbortSignal,
  onDelta?: (text: string) => void,
): Promise<GenerationResult> {
  const prompt = buildPrompt(request);
  const first = await collect(adapter.streamCompletion(prompt, apiKey, signal), onDelta);
  const firstResult = validateGenerateResponse(stripCodeFence(first));
  if (firstResult.success) return { ok: true, response: firstResult.data, attempts: 1 };

  const messages: ProviderMessage[] = [
    ...prompt.messages,
    { role: "assistant", content: first },
    { role: "user", content: firstResult.retryPrompt },
  ];
  const second = await collect(
    adapter.streamCompletion({ system: prompt.system, messages }, apiKey, signal),
    undefined,
  );
  const secondResult = validateGenerateResponse(stripCodeFence(second));
  if (secondResult.success) return { ok: true, response: secondResult.data, attempts: 2 };
  return { ok: false, rawText: second, issues: secondResult.issues };
}
