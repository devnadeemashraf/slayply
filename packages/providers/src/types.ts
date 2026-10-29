import type { GenerateRequest } from "@slayply/core";

export const PROVIDER_IDS = ["anthropic", "openai", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Provider-neutral stream unit; adapters translate their vendor format into these. */
export type GenerateChunk = { type: "delta"; text: string } | { type: "done" };

export type ProviderMessage = { role: "user" | "assistant"; content: string };

/** A full conversation to send; `generateValidated` uses more than one message for the repair retry. */
export type CompletionInput = { system: string; messages: readonly ProviderMessage[] };

export type ModelInfo = { id: string; displayName: string };

export type ProviderAdapter = {
  readonly id: ProviderId;
  /** Builds the SPEC §7 prompt for a validated request and streams the model's reply. */
  stream(
    request: GenerateRequest,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateChunk>;
  /** Streams the reply to an arbitrary conversation. */
  streamCompletion(
    input: CompletionInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateChunk>;
  /** Lists the models this key can use, newest first. Cached per key fingerprint. */
  listModels(apiKey: string, signal: AbortSignal): Promise<ModelInfo[]>;
};

export type ProviderErrorKind =
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "invalid_request"
  | "upstream"
  | "network";

/** Provider failure with a stable kind. The message is ours and never carries upstream text. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | undefined;

  constructor(kind: ProviderErrorKind, status?: number) {
    super(`Provider request failed: ${kind}`);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
  }
}
