import { buildPrompt, type GenerateRequest } from "@slayply/core";
import { readSse } from "./sse.js";
import {
  type CompletionInput,
  type GenerateChunk,
  type ModelInfo,
  type ProviderAdapter,
  ProviderError,
  type ReasoningEffort,
} from "./types.js";
import { fingerprint, isRecord, parseJson } from "./util.js";

const DEFAULT_BASE_URL = "https://api.openai.com";
const MAX_OUTPUT_TOKENS = 16_000;
const MAX_MODELS_BODY_CHARS = 1_000_000;
const MAX_MODELS = 200;
const MODEL_CACHE_TTL_MS = 10 * 60_000;
const MODEL_CACHE_MAX_ENTRIES = 100;

// `GET /v1/models` has no capability fields, so chat models and reasoning support are read from the id.
const CHAT_MODEL = /^(gpt-|chatgpt-|o\d)/;
const NON_CHAT_MODEL =
  /(embedding|audio|realtime|image|tts|transcribe|moderation|search|instruct|codex|davinci|babbage|whisper|dall-e|-pro)/;
const REASONING_MODEL = /^(o\d|gpt-5)/;
const NON_REASONING_VARIANT = /chat-latest|^o1-(mini|preview)/;

export type OpenAiAdapterOptions = {
  /** Defaults to the global `fetch`; tests inject recorded fixtures. */
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Model id to use. When omitted the newest chat model from the models endpoint is used. */
  model?: string;
  /** Sent as `reasoning_effort` only when the model supports it. */
  effort?: ReasoningEffort;
  now?: () => number;
};

type CachedModels = { models: ModelInfo[]; expiresAt: number };

export function supportsReasoningEffort(modelId: string): boolean {
  return REASONING_MODEL.test(modelId) && !NON_REASONING_VARIANT.test(modelId);
}

function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("auth", status);
  if (status === 429) return new ProviderError("rate_limit", status);
  if (status === 503) return new ProviderError("overloaded", status);
  if (status >= 400 && status < 500) return new ProviderError("invalid_request", status);
  return new ProviderError("upstream", status);
}

function errorForEvent(error: unknown): ProviderError {
  const code = isRecord(error) ? error.code : undefined;
  if (code === "rate_limit_exceeded" || code === "insufficient_quota") {
    return new ProviderError("rate_limit");
  }
  if (code === "invalid_api_key") return new ProviderError("auth");
  return new ProviderError("upstream");
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedModels>();

  function headers(apiKey: string, json: boolean): Record<string, string> {
    return {
      authorization: `Bearer ${apiKey}`,
      ...(json ? { "content-type": "application/json" } : {}),
    };
  }

  /** fetch that maps transport failures and non-2xx statuses to `ProviderError`. */
  async function call(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ProviderError("network");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw errorForStatus(response.status);
    }
    return response;
  }

  async function listModels(apiKey: string, signal: AbortSignal): Promise<ModelInfo[]> {
    const cacheKey = await fingerprint(apiKey);
    const hit = cache.get(cacheKey);
    if (hit !== undefined && hit.expiresAt > now()) return hit.models;

    const response = await call(
      `${baseUrl}/v1/models`,
      { method: "GET", headers: headers(apiKey, false) },
      signal,
    );
    const text = await response.text();
    if (text.length > MAX_MODELS_BODY_CHARS) throw new ProviderError("upstream");
    const body = parseJson(text);
    if (!isRecord(body) || !Array.isArray(body.data)) throw new ProviderError("upstream");

    // The endpoint is unordered; sort by `created`, newest first.
    const found: Array<{ id: string; created: number }> = [];
    for (const item of body.data) {
      if (!isRecord(item) || typeof item.id !== "string") continue;
      if (!CHAT_MODEL.test(item.id) || NON_CHAT_MODEL.test(item.id)) continue;
      found.push({ id: item.id, created: typeof item.created === "number" ? item.created : 0 });
    }
    found.sort((a, b) => b.created - a.created);
    const models = found.slice(0, MAX_MODELS).map(({ id }) => ({
      id,
      displayName: id,
      supportsEffort: supportsReasoningEffort(id),
    }));

    // Bounded: drop the oldest entry (Map keeps insertion order) before adding a new key.
    if (!cache.has(cacheKey) && cache.size >= MODEL_CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, { models, expiresAt: now() + MODEL_CACHE_TTL_MS });
    return models;
  }

  async function resolveModel(apiKey: string, signal: AbortSignal): Promise<string> {
    if (options.model !== undefined) return options.model;
    const [newest] = await listModels(apiKey, signal);
    if (newest === undefined) throw new ProviderError("upstream");
    return newest.id;
  }

  async function* streamCompletion(
    input: CompletionInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncGenerator<GenerateChunk> {
    const model = await resolveModel(apiKey, signal);
    const effort =
      options.effort !== undefined && supportsReasoningEffort(model)
        ? { reasoning_effort: options.effort }
        : {};
    const response = await call(
      `${baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: headers(apiKey, true),
        body: JSON.stringify({
          model,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          ...effort,
          messages: [{ role: "system", content: input.system }, ...input.messages],
        }),
      },
      signal,
    );
    if (response.body === null) throw new ProviderError("upstream");

    for await (const sse of readSse(response.body)) {
      if (sse.data === "[DONE]") {
        yield { type: "done" };
        return;
      }
      const payload = parseJson(sse.data);
      if (!isRecord(payload)) throw new ProviderError("upstream");
      if (payload.error !== undefined) throw errorForEvent(payload.error);

      const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
      // A reply cut by the token budget (reasoning models spend it on hidden tokens) or filtered is not complete.
      if (
        isRecord(choice) &&
        (choice.finish_reason === "length" || choice.finish_reason === "content_filter")
      ) {
        throw new ProviderError("upstream");
      }
      const delta = isRecord(choice) ? choice.delta : undefined;
      if (isRecord(delta) && typeof delta.content === "string" && delta.content !== "") {
        yield { type: "delta", text: delta.content };
      }
    }
    // The body ended without `[DONE]`: the reply is truncated.
    throw new ProviderError("upstream");
  }

  function stream(
    request: GenerateRequest,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateChunk> {
    return streamCompletion(buildPrompt(request), apiKey, signal);
  }

  return { id: "openai", stream, streamCompletion, listModels };
}
