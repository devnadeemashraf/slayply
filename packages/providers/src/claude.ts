import { buildPrompt, type GenerateRequest } from "@slayply/core";
import { readSse } from "./sse.js";
import {
  type CompletionInput,
  type GenerateChunk,
  type ModelInfo,
  type ProviderAdapter,
  ProviderError,
} from "./types.js";
import { fingerprint, isRecord, parseJson } from "./util.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
// 2023-06-01 is still valid (docs/VERSIONS.md); 2026-10-21 only removes sampling parameters we never send.
const API_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 16_000;
const MODEL_PAGE_SIZE = 1000;
const MAX_MODELS_BODY_CHARS = 1_000_000;
const MAX_MODELS = 200;
const MODEL_CACHE_TTL_MS = 10 * 60_000;
const MODEL_CACHE_MAX_ENTRIES = 100;

export type ClaudeAdapterOptions = {
  /** Defaults to the global `fetch`; tests inject recorded fixtures. */
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Sends the browser-access opt-in header; set only when running inside the extension (Direct Mode). */
  browserAccess?: boolean;
  /** Model id to use. When omitted the newest model from the models endpoint is used. */
  model?: string;
  now?: () => number;
};

type CachedModels = { models: ModelInfo[]; expiresAt: number };

function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("auth", status);
  if (status === 429) return new ProviderError("rate_limit", status);
  if (status === 529) return new ProviderError("overloaded", status);
  if (status >= 400 && status < 500) return new ProviderError("invalid_request", status);
  return new ProviderError("upstream", status);
}

function errorForEvent(type: unknown): ProviderError {
  if (type === "overloaded_error") return new ProviderError("overloaded");
  if (type === "rate_limit_error") return new ProviderError("rate_limit");
  if (type === "authentication_error" || type === "permission_error") {
    return new ProviderError("auth");
  }
  if (type === "invalid_request_error") return new ProviderError("invalid_request");
  return new ProviderError("upstream");
}

export function createClaudeAdapter(options: ClaudeAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedModels>();

  function headers(apiKey: string, json: boolean): Record<string, string> {
    return {
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      ...(json ? { "content-type": "application/json" } : {}),
      ...(options.browserAccess ? { "anthropic-dangerous-direct-browser-access": "true" } : {}),
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
      `${baseUrl}/v1/models?limit=${MODEL_PAGE_SIZE}`,
      { method: "GET", headers: headers(apiKey, false) },
      signal,
    );
    const text = await response.text();
    if (text.length > MAX_MODELS_BODY_CHARS) throw new ProviderError("upstream");
    const body = parseJson(text);
    if (!isRecord(body) || !Array.isArray(body.data)) throw new ProviderError("upstream");

    const models: ModelInfo[] = [];
    for (const item of body.data) {
      if (models.length >= MAX_MODELS) break;
      if (!isRecord(item) || typeof item.id !== "string") continue;
      const displayName = typeof item.display_name === "string" ? item.display_name : item.id;
      models.push({ id: item.id, displayName });
    }

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
    const response = await call(
      `${baseUrl}/v1/messages`,
      {
        method: "POST",
        headers: headers(apiKey, true),
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          system: input.system,
          messages: input.messages,
        }),
      },
      signal,
    );
    if (response.body === null) throw new ProviderError("upstream");

    for await (const sse of readSse(response.body)) {
      if (sse.event === "ping") continue;
      const payload = parseJson(sse.data);
      if (!isRecord(payload)) throw new ProviderError("upstream");

      if (sse.event === "error") {
        throw errorForEvent(isRecord(payload.error) ? payload.error.type : undefined);
      }
      if (sse.event === "content_block_delta") {
        const delta = payload.delta;
        if (isRecord(delta) && delta.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "delta", text: delta.text };
        }
        continue;
      }
      if (sse.event === "message_stop") {
        yield { type: "done" };
        return;
      }
    }
    // The body ended without `message_stop`: the reply is truncated.
    throw new ProviderError("upstream");
  }

  function stream(
    request: GenerateRequest,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateChunk> {
    return streamCompletion(buildPrompt(request), apiKey, signal);
  }

  return { id: "anthropic", stream, streamCompletion, listModels };
}
