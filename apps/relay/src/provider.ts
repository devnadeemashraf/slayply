import {
  PROVIDER_IDS,
  type ProviderAdapter,
  ProviderError,
  type ProviderId,
} from "@slayply/providers";

export type {
  GenerateChunk,
  ModelInfo,
  ProviderAdapter,
  ProviderId,
  ReasoningEffort,
} from "@slayply/providers";
export { PROVIDER_IDS, ProviderError };

/** Lower-case header that carries the user's key for each provider (SPEC §5). */
export const KEY_HEADERS = {
  anthropic: "x-user-anthropic-key",
  openai: "x-user-openai-key",
  gemini: "x-user-gemini-key",
} as const satisfies Record<ProviderId, string>;

export type ProviderRegistry = Partial<Record<ProviderId, ProviderAdapter>>;
