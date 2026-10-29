import type { GenerateRequest } from "@slayply/core";
import { readSse } from "./sse.js";

/** A failure the user can read: `message` is the relay's static text or one of ours, never upstream text. */
export class RelayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

export type StreamGenerateOptions = {
  baseUrl: string;
  apiKey: string;
  request: GenerateRequest;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
};

const MAX_MESSAGE_CHARS = 200;

export const KEY_HEADERS = {
  anthropic: "X-User-Anthropic-Key",
  openai: "X-User-OpenAI-Key",
  gemini: "X-User-Gemini-Key",
} as const;

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function asRelayFields(value: unknown): { code: string; message: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const { code, message } = value as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return null;
  return { code: code.slice(0, 64), message: message.slice(0, MAX_MESSAGE_CHARS) };
}

async function httpError(response: Response): Promise<RelayError> {
  try {
    const body: unknown = await response.json();
    const fields = asRelayFields((body as { error?: unknown } | null)?.error);
    if (fields) return new RelayError(fields.code, fields.message, response.status);
  } catch {
    // Not the relay's JSON (a proxy or captive portal): fall through to a generic message.
  }
  return new RelayError(
    `HTTP_${response.status}`,
    `The relay returned an error (HTTP ${response.status}).`,
    response.status,
  );
}

function parseDelta(data: string): string | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const text = (parsed as { text?: unknown } | null)?.text;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

const NETWORK_MESSAGE = "Could not reach the relay. Check your connection and try again.";

/**
 * Calls `POST /v1/generate` and yields each text delta. The key goes in a header only.
 * Throws `RelayError` for relay, HTTP, network and truncated-stream failures; an abort is
 * rethrown unchanged so callers can tell cancelling from failing.
 */
export async function* streamGenerate(options: StreamGenerateOptions): AsyncGenerator<string> {
  let response: Response;
  try {
    response = await options.fetchFn(`${options.baseUrl.replace(/\/+$/, "")}/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [KEY_HEADERS[options.request.provider ?? "anthropic"]]: options.apiKey,
      },
      body: JSON.stringify(options.request),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new RelayError("NETWORK", NETWORK_MESSAGE);
  }

  if (!response.ok) throw await httpError(response);
  if (!response.body) throw new RelayError("STREAM_INCOMPLETE", "The relay sent no answer.");

  let finished = false;
  try {
    for await (const event of readSse(response.body)) {
      if (event.event === "delta") {
        const text = parseDelta(event.data);
        if (text !== null) yield text;
      } else if (event.event === "done") {
        finished = true;
        break;
      } else if (event.event === "error") {
        let fields: { code: string; message: string } | null = null;
        try {
          fields = asRelayFields(JSON.parse(event.data));
        } catch {
          // Keep the generic failure below.
        }
        throw new RelayError(
          fields?.code ?? "UPSTREAM_ERROR",
          fields?.message ?? "The generation failed.",
        );
      }
    }
  } catch (error) {
    if (error instanceof RelayError || isAbortError(error)) throw error;
    throw new RelayError("NETWORK", NETWORK_MESSAGE);
  }

  if (!finished) {
    throw new RelayError("STREAM_INCOMPLETE", "The answer stream ended early. Try again.");
  }
}
