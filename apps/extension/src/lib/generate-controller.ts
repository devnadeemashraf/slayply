import {
  type GenerateRequest,
  type GenerateResponse,
  validateGenerateResponse,
} from "@slayply/core";
import { stripCodeFence } from "@slayply/providers";
import { extractAnswerPreview } from "./partial-text.js";
import { isAbortError, RelayError, streamGenerate } from "./relay-client.js";

export type GenerationState =
  | { phase: "idle" }
  /** `preview` is unvalidated and only for display; `attempt` 2 is the single automatic retry. */
  | { phase: "streaming"; attempt: 1 | 2; preview: string }
  | { phase: "done"; response: GenerateResponse; attempts: 1 | 2 }
  /** Both attempts failed validation: the last reply, shown as unvalidated text. */
  | { phase: "raw"; rawText: string; issues: { path: string; message: string }[] }
  | { phase: "error"; message: string; code: string };

export type RunGenerationOptions = {
  baseUrl: string;
  apiKey: string;
  request: GenerateRequest;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  onState: (state: GenerationState) => void;
};

/** Stops a runaway stream: far above a valid reply (outputs are capped at 50,000 characters each). */
export const MAX_REPLY_CHARS = 200_000;

/**
 * Generates through the relay. The relay streams raw text and cannot take a repair prompt
 * (ADR-0004), so the client validates the reply itself and, on failure, asks once more with the
 * same request (ADR-0006). Relay and network errors are never retried; cancelling ends in `idle`.
 */
export async function runGeneration(options: RunGenerationOptions): Promise<void> {
  const { onState } = options;
  let lastIssues: { path: string; message: string }[] = [];
  let lastText = "";

  for (const attempt of [1, 2] as const) {
    onState({ phase: "streaming", attempt, preview: "" });
    let buffer = "";
    try {
      for await (const delta of streamGenerate(options)) {
        buffer += delta;
        if (buffer.length > MAX_REPLY_CHARS) {
          throw new RelayError("TOO_LARGE", "The reply was larger than expected. Try again.");
        }
        onState({ phase: "streaming", attempt, preview: extractAnswerPreview(buffer) });
      }
    } catch (error) {
      if (isAbortError(error) || options.signal.aborted) {
        onState({ phase: "idle" });
      } else if (error instanceof RelayError) {
        onState({ phase: "error", message: error.message, code: error.code });
      } else {
        onState({
          phase: "error",
          message: "The generation failed unexpectedly.",
          code: "UNKNOWN",
        });
      }
      return;
    }

    const result = validateGenerateResponse(stripCodeFence(buffer));
    if (result.success) {
      onState({ phase: "done", response: result.data, attempts: attempt });
      return;
    }
    lastIssues = result.issues;
    lastText = buffer;
  }

  onState({ phase: "raw", rawText: lastText, issues: lastIssues });
}

/**
 * Runs one generation at a time. Starting a new one cancels the previous, and only the newest
 * run may report state, so a cancelled run's late `idle` cannot wipe the new run's output.
 */
export function createGenerationRunner(onState: (state: GenerationState) => void) {
  let current: AbortController | null = null;
  return {
    start(options: Omit<RunGenerationOptions, "signal" | "onState">): Promise<void> {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return runGeneration({
        ...options,
        signal: controller.signal,
        onState: (state) => {
          if (current === controller) onState(state);
        },
      });
    },
    stop(): void {
      current?.abort();
    },
  };
}

/** The text the Copy button writes, or `null` while there is nothing safe to copy. */
export function copyTextOf(state: GenerationState): string | null {
  if (state.phase === "done")
    return state.response.outputs.map((output) => output.text).join("\n\n");
  if (state.phase === "raw") return state.rawText;
  return null;
}
