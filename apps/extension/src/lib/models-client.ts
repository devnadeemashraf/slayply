import type { ProviderId } from "@slayply/providers";
import { KEY_HEADERS } from "./relay-client.js";

export type ModelChoice = { id: string; displayName: string; supportsEffort: boolean };

export type ModelListResult = { ok: true; models: ModelChoice[] } | { ok: false; message: string };

export type FetchModelsOptions = {
  baseUrl: string;
  provider: ProviderId;
  apiKey: string;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
};

const MAX_MODELS = 200;
const MAX_NAME_CHARS = 100;
const MODEL_ID = /^[\w.:-]{1,64}$/;
const FALLBACK = "Could not load the model list. The newest model will be used.";

function relayMessage(body: unknown): string | null {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? message.slice(0, 200) : null;
}

/**
 * Loads a provider's model list through the relay. Never throws: the picker falls back to the
 * provider's newest model, so a failed list must not block generating.
 */
export async function fetchModels(options: FetchModelsOptions): Promise<ModelListResult> {
  try {
    const url = `${options.baseUrl.replace(/\/+$/, "")}/v1/models?provider=${options.provider}`;
    const response = await options.fetchFn(url, {
      headers: { [KEY_HEADERS[options.provider]]: options.apiKey },
      signal: options.signal,
    });
    const body: unknown = await response.json();
    if (!response.ok) return { ok: false, message: relayMessage(body) ?? FALLBACK };

    const list = (body as { models?: unknown } | null)?.models;
    if (!Array.isArray(list)) return { ok: false, message: FALLBACK };
    const models: ModelChoice[] = [];
    for (const item of list) {
      if (models.length >= MAX_MODELS) break;
      if (typeof item !== "object" || item === null) continue;
      const { id, displayName, supportsEffort } = item as Record<string, unknown>;
      if (typeof id !== "string" || !MODEL_ID.test(id)) continue;
      models.push({
        id,
        displayName: typeof displayName === "string" ? displayName.slice(0, MAX_NAME_CHARS) : id,
        supportsEffort: supportsEffort === true,
      });
    }
    return { ok: true, models };
  } catch {
    return { ok: false, message: FALLBACK };
  }
}
