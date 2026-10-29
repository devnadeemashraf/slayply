import type { GenerateRequest } from "@slayply/core";

export const PROVIDER_IDS = ["anthropic", "openai", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Lower-case header that carries the user's key for each provider (SPEC §5). */
export const KEY_HEADERS = {
  anthropic: "x-user-anthropic-key",
  openai: "x-user-openai-key",
  gemini: "x-user-gemini-key",
} as const satisfies Record<ProviderId, string>;

/** Provider-neutral stream unit; adapters translate their vendor format into these. */
export type GenerateChunk = { type: "delta"; text: string } | { type: "done" };

export type ProviderAdapter = {
  readonly id: ProviderId;
  /** Streams model output for a validated request. The key must not be stored or logged. */
  stream(
    request: GenerateRequest,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateChunk>;
};

export type ProviderRegistry = Partial<Record<ProviderId, ProviderAdapter>>;
