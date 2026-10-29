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

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const MAX_OUTPUT_TOKENS = 16_000;
const MODEL_PAGE_SIZE = 1000;
const MAX_MODELS_BODY_CHARS = 1_000_000;
const MAX_MODELS = 200;
const MODEL_CACHE_TTL_MS = 10 * 60_000;
const MODEL_CACHE_MAX_ENTRIES = 100;
const MAX_ERROR_BODY_CHARS = 10_000;

// The models list says what a model can do but not its generation, so family and thinking come from the id.
const TEXT_MODEL = /^gemini-/;
const NON_TEXT_MODEL =
  /(image|tts|embedding|aqa|live|audio|vision|robotics|computer-use|imagen|veo|learnlm)/;
const THINKING_MODEL = /^gemini-(2\.5|[3-9])/;
const REDUCED_MODEL = /(lite|preview|exp|latest)/;
const VERSION = /^gemini-(\d+(?:\.\d+)?)/;

// 2.5 models take a token budget (Pro accepts 128 to 32768, Flash 0 to 24576); these fit every 2.5 model.
const THINKING_BUDGET: Record<ReasoningEffort, number> = { low: 1024, medium: 8192, high: 24_576 };
// Gemini 3 takes a level. "medium" is not accepted on every 3 model, so it maps to the default "high".
const THINKING_LEVEL: Record<ReasoningEffort, "low" | "high"> = {
  low: "low",
  medium: "high",
  high: "high",
};

export type GeminiAdapterOptions = {
  /** Defaults to the global `fetch`; tests inject recorded fixtures. */
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Model id to use. When omitted the newest text model from the models endpoint is used. */
  model?: string;
  /** Sent as a thinking budget or level only when the model supports thinking. */
  effort?: ReasoningEffort;
  now?: () => number;
};

type CachedModels = { models: ModelInfo[]; expiresAt: number };

export function supportsThinking(modelId: string): boolean {
  return THINKING_MODEL.test(modelId) && !NON_TEXT_MODEL.test(modelId);
}

function versionOf(modelId: string): number {
  return Number(VERSION.exec(modelId)?.[1] ?? 0);
}

function errorForStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("auth", status);
  if (status === 429) return new ProviderError("rate_limit", status);
  if (status === 503) return new ProviderError("overloaded", status);
  if (status >= 400 && status < 500) return new ProviderError("invalid_request", status);
  return new ProviderError("upstream", status);
}

function errorForEvent(error: unknown): ProviderError {
  const status = isRecord(error) ? error.status : undefined;
  if (status === "RESOURCE_EXHAUSTED") return new ProviderError("rate_limit");
  if (status === "UNAVAILABLE") return new ProviderError("overloaded");
  if (status === "UNAUTHENTICATED" || status === "PERMISSION_DENIED") {
    return new ProviderError("auth");
  }
  return new ProviderError("upstream");
}

export function createGeminiAdapter(options: GeminiAdapterOptions = {}): ProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const now = options.now ?? Date.now;
  const cache = new Map<string, CachedModels>();

  // The key travels in a header, never the URL, so it cannot reach a URL log.
  function headers(apiKey: string, json: boolean): Record<string, string> {
    return { "x-goog-api-key": apiKey, ...(json ? { "content-type": "application/json" } : {}) };
  }

  /** Gemini answers a bad key with 400 `API_KEY_INVALID`; only that marker is read, none of the text is kept. */
  async function errorForResponse(response: Response): Promise<ProviderError> {
    if (response.status !== 400) {
      await response.body?.cancel().catch(() => undefined);
      return errorForStatus(response.status);
    }
    const body = (await response.text().catch(() => "")).slice(0, MAX_ERROR_BODY_CHARS);
    return body.includes("API_KEY_INVALID")
      ? new ProviderError("auth", 400)
      : new ProviderError("invalid_request", 400);
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
    if (!response.ok) throw await errorForResponse(response);
    return response;
  }

  async function listModels(apiKey: string, signal: AbortSignal): Promise<ModelInfo[]> {
    const cacheKey = await fingerprint(apiKey);
    const hit = cache.get(cacheKey);
    if (hit !== undefined && hit.expiresAt > now()) return hit.models;

    const response = await call(
      `${baseUrl}/v1beta/models?pageSize=${MODEL_PAGE_SIZE}`,
      { method: "GET", headers: headers(apiKey, false) },
      signal,
    );
    const text = await response.text();
    if (text.length > MAX_MODELS_BODY_CHARS) throw new ProviderError("upstream");
    const body = parseJson(text);
    if (!isRecord(body) || !Array.isArray(body.models)) throw new ProviderError("upstream");

    const found: ModelInfo[] = [];
    for (const item of body.models) {
      if (!isRecord(item) || typeof item.name !== "string") continue;
      const id = item.name.replace(/^models\//, "");
      if (!TEXT_MODEL.test(id) || NON_TEXT_MODEL.test(id)) continue;
      const methods = item.supportedGenerationMethods;
      if (!Array.isArray(methods) || !methods.includes("generateContent")) continue;
      const displayName = typeof item.displayName === "string" ? item.displayName : id;
      found.push({ id, displayName, supportsEffort: supportsThinking(id) });
    }
    // The endpoint has no date field: newest version first, then full models before lite or preview ones,
    // so the default pick (the first entry) is a stable release.
    const reduced = (id: string) => (REDUCED_MODEL.test(id) ? 1 : 0);
    found.sort((a, b) => versionOf(b.id) - versionOf(a.id) || reduced(a.id) - reduced(b.id));
    const models = found.slice(0, MAX_MODELS);

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

  function thinkingConfig(model: string): Record<string, unknown> {
    if (options.effort === undefined || !supportsThinking(model)) return {};
    return Math.floor(versionOf(model)) >= 3
      ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL[options.effort] } }
      : { thinkingConfig: { thinkingBudget: THINKING_BUDGET[options.effort] } };
  }

  async function* streamCompletion(
    input: CompletionInput,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncGenerator<GenerateChunk> {
    const model = await resolveModel(apiKey, signal);
    const response = await call(
      `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: headers(apiKey, true),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: input.messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, ...thinkingConfig(model) },
        }),
      },
      signal,
    );
    if (response.body === null) throw new ProviderError("upstream");

    for await (const sse of readSse(response.body)) {
      const payload = parseJson(sse.data);
      if (!isRecord(payload)) throw new ProviderError("upstream");
      if (payload.error !== undefined) throw errorForEvent(payload.error);

      const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : undefined;
      if (!isRecord(candidate)) {
        // No candidate means the prompt was blocked, or a usage-only frame.
        if (isRecord(payload.promptFeedback) && payload.promptFeedback.blockReason !== undefined) {
          throw new ProviderError("upstream");
        }
        continue;
      }

      const content = candidate.content;
      const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
      for (const part of parts) {
        if (!isRecord(part) || part.thought === true) continue;
        if (typeof part.text === "string" && part.text !== "") {
          yield { type: "delta", text: part.text };
        }
      }

      // Anything but STOP (token limit, safety, recitation) is an incomplete reply.
      if (candidate.finishReason !== undefined && candidate.finishReason !== null) {
        if (candidate.finishReason !== "STOP") throw new ProviderError("upstream");
        yield { type: "done" };
        return;
      }
    }
    // The body ended without a STOP finish: the reply is truncated.
    throw new ProviderError("upstream");
  }

  function stream(
    request: GenerateRequest,
    apiKey: string,
    signal: AbortSignal,
  ): AsyncIterable<GenerateChunk> {
    return streamCompletion(buildPrompt(request), apiKey, signal);
  }

  return { id: "gemini", stream, streamCompletion, listModels };
}
