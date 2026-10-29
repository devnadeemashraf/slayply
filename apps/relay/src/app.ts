import type { HttpBindings } from "@hono/node-server";
import { MAX_PAYLOAD_BYTES, validateGenerateRequest } from "@slayply/core";
import { ProviderError, type ProviderErrorKind } from "@slayply/providers";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { readBodyText } from "./body.js";
import { resolveClientIp } from "./client-ip.js";
import { isAllowedOrigin } from "./cors.js";
import {
  type GenerateChunk,
  KEY_HEADERS,
  PROVIDER_IDS,
  type ProviderAdapter,
  type ProviderId,
  type ProviderRegistry,
  type ReasoningEffort,
} from "./provider.js";
import { createRateLimiter } from "./rate-limit.js";

export type AdapterChoice = { model?: string; effort?: ReasoningEffort };

export type AppOptions = {
  providers: ProviderRegistry;
  /**
   * Builds the adapter for a request that names a model or effort. Defaults to the registered
   * adapter, which uses its own settings.
   */
  adapterFor?: (providerId: ProviderId, choice: AdapterChoice) => ProviderAdapter | undefined;
  extensionIds: readonly string[];
  trustedHops: number;
  /** Receives one metadata-only line per request. */
  log: (line: string) => void;
  now: () => number;
  rateLimit?: { limit: number; windowMs: number };
  /** Total time one generation may stream before it is cut off. */
  streamDeadlineMs?: number;
  /** Simultaneous open generations allowed per client IP. */
  maxOpenStreamsPerIp?: number;
  /** Time a request body may take to arrive in full. */
  bodyTimeoutMs?: number;
};

type RelayEnv = {
  Bindings: Partial<HttpBindings>;
  Variables: { provider?: ProviderId; clientIp: string };
};

const DEFAULT_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const DEFAULT_STREAM_DEADLINE_MS = 120_000;
const DEFAULT_MAX_OPEN_STREAMS = 2;
const DEFAULT_BODY_TIMEOUT_MS = 15_000;
const MODELS_TIMEOUT_MS = 10_000;
const MAX_TRACKED_IPS = 10_000;
// Printable ASCII only, so a key can never be an invalid header value for the upstream call.
const API_KEY_PATTERN = /^[!-~]{1,512}$/;

/** Static, user-safe text per failure kind; upstream messages are never forwarded. */
const UPSTREAM_ERRORS: Record<ProviderErrorKind, { code: string; message: string }> = {
  auth: { code: "UPSTREAM_AUTH", message: "The provider rejected the API key" },
  rate_limit: { code: "UPSTREAM_RATE_LIMITED", message: "The provider is rate limiting this key" },
  overloaded: { code: "UPSTREAM_OVERLOADED", message: "The provider is overloaded" },
  invalid_request: { code: "UPSTREAM_REJECTED", message: "The provider rejected the request" },
  upstream: { code: "UPSTREAM_ERROR", message: "The provider request failed" },
  network: { code: "UPSTREAM_ERROR", message: "The provider request failed" },
};

const MODELS_STATUS: Record<ProviderErrorKind, ContentfulStatusCode> = {
  auth: 401,
  rate_limit: 429,
  overloaded: 503,
  invalid_request: 502,
  upstream: 502,
  network: 502,
};

function upstreamError(error: unknown): { code: string; message: string; kind: ProviderErrorKind } {
  const kind = error instanceof ProviderError ? error.kind : "upstream";
  return { ...UPSTREAM_ERRORS[kind], kind };
}
const ALLOWED_REQUEST_HEADERS = ["Content-Type", ...PROVIDER_IDS.map((id) => KEY_HEADERS[id])];

function fail(
  c: Context<RelayEnv>,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details: unknown[] = [],
): Response {
  return c.json({ error: { code, message, details } }, status);
}

function invalidKey(c: Context<RelayEnv>): Response {
  return fail(c, 400, "INVALID_API_KEY", "The API key header has invalid characters or length");
}

function isJsonContentType(header: string | undefined): boolean {
  return header?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

export function createApp(options: AppOptions): Hono<RelayEnv> {
  const { providers, extensionIds, trustedHops, log, now } = options;
  const limiter = createRateLimiter({
    ...(options.rateLimit ?? DEFAULT_RATE_LIMIT),
    maxEntries: MAX_TRACKED_IPS,
    now,
  });
  const streamDeadlineMs = options.streamDeadlineMs ?? DEFAULT_STREAM_DEADLINE_MS;
  const maxOpenStreams = options.maxOpenStreamsPerIp ?? DEFAULT_MAX_OPEN_STREAMS;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  const openStreams = new Map<string, number>();
  const app = new Hono<RelayEnv>();

  // Outermost, so every response is logged. Metadata only: no headers, bodies or paths.
  app.use(async (c, next) => {
    const start = performance.now();
    await next();
    const latency = Math.round(performance.now() - start);
    const provider = c.get("provider") ?? "-";
    log(`[${new Date(now()).toISOString()}] [${c.res.status}] [${latency}] [${provider}] [-]`);
  });

  // The limiter runs first so rejected and preflight requests count too. Allowed origins
  // still get CORS headers on a 429, so the extension can read the error.
  app.use(async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "no-store");

    const origin = c.req.header("origin");
    const originAllowed = origin !== undefined && isAllowedOrigin(origin, extensionIds);
    if (origin !== undefined) c.header("Vary", "Origin");
    if (originAllowed) c.header("Access-Control-Allow-Origin", origin);

    const clientIp = resolveClientIp({
      forwardedFor: c.req.header("x-forwarded-for"),
      socketAddress: c.env?.incoming?.socket?.remoteAddress,
      trustedHops,
    });
    c.set("clientIp", clientIp);
    const decision = limiter.check(clientIp);
    if (!decision.allowed) {
      c.header("Retry-After", String(decision.retryAfterSeconds));
      return fail(c, 429, "RATE_LIMITED", "Too many requests");
    }

    if (origin !== undefined && !originAllowed) {
      return fail(c, 403, "FORBIDDEN_ORIGIN", "Origin is not allowed");
    }
    if (originAllowed && c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", ALLOWED_REQUEST_HEADERS.join(", "));
      c.header("Access-Control-Max-Age", "600");
      return c.body(null, 204);
    }
    return next();
  });

  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date(now()).toISOString() }));

  app.post("/v1/generate", async (c) => {
    if (!isJsonContentType(c.req.header("content-type"))) {
      return fail(c, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json");
    }
    const tooLarge = () =>
      fail(c, 413, "PAYLOAD_TOO_LARGE", `Payload exceeds ${MAX_PAYLOAD_BYTES / 1024} KB limit`);

    const declared = Number(c.req.header("content-length"));
    if (Number.isFinite(declared) && declared > MAX_PAYLOAD_BYTES) return tooLarge();

    const present = PROVIDER_IDS.filter(
      (id) => (c.req.header(KEY_HEADERS[id])?.trim() ?? "") !== "",
    );
    const [providerId] = present;
    if (providerId === undefined) {
      return fail(c, 400, "MISSING_API_KEY", "Provide your API key in an X-User-*-Key header");
    }
    if (present.length > 1) {
      return fail(c, 400, "AMBIGUOUS_API_KEY", "Provide exactly one X-User-*-Key header");
    }
    c.set("provider", providerId);

    const body = await readBodyText(c.req.raw, MAX_PAYLOAD_BYTES, bodyTimeoutMs);
    if (!body.ok) {
      if (body.reason === "too_large") return tooLarge();
      if (body.reason === "timeout") {
        return fail(c, 408, "REQUEST_TIMEOUT", "The request body took too long to arrive");
      }
      return fail(c, 400, "BAD_REQUEST", "Body must be valid UTF-8 text");
    }

    const parsed = validateGenerateRequest(body.text);
    if (!parsed.success) {
      return fail(c, 400, "BAD_REQUEST", "Request failed validation", parsed.issues);
    }

    const adapter = providers[providerId];
    if (adapter === undefined) {
      return fail(
        c,
        501,
        "PROVIDER_NOT_IMPLEMENTED",
        `Provider "${providerId}" is not available yet`,
      );
    }

    // Read the key straight into the call; it is never stored, logged or echoed.
    const apiKey = (c.req.header(KEY_HEADERS[providerId]) ?? "").trim();
    if (!API_KEY_PATTERN.test(apiKey)) return invalidKey(c);

    const { provider: requestedProvider, model, effort } = parsed.data;
    if (requestedProvider !== undefined && requestedProvider !== providerId) {
      return fail(c, 400, "PROVIDER_MISMATCH", "The provider does not match the API key header");
    }
    let streamAdapter = adapter;
    if (model !== undefined || effort !== undefined) {
      // The model id is client text: it is used only if the provider's own list names it.
      if (model !== undefined) {
        try {
          const listed = await adapter.listModels(
            apiKey,
            AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(MODELS_TIMEOUT_MS)]),
          );
          if (!listed.some((entry) => entry.id === model)) {
            return fail(c, 400, "UNKNOWN_MODEL", "That model is not available for this key");
          }
        } catch (error) {
          const failure = upstreamError(error);
          return fail(c, MODELS_STATUS[failure.kind], failure.code, failure.message);
        }
      }
      // Never fall back to the default adapter: the user would get a model they did not pick.
      const chosen = options.adapterFor?.(providerId, {
        ...(model !== undefined ? { model } : {}),
        ...(effort !== undefined ? { effort } : {}),
      });
      if (chosen === undefined) throw new Error("no adapter factory for a chosen model");
      streamAdapter = chosen;
    }

    // The limiter counts requests per minute; this caps generations running at the same time.
    const clientIp = c.get("clientIp");
    const open = openStreams.get(clientIp) ?? 0;
    if (open >= maxOpenStreams) {
      c.header("Retry-After", "5");
      return fail(c, 429, "TOO_MANY_STREAMS", "Too many generations are already running");
    }
    openStreams.set(clientIp, open + 1);

    const abort = new AbortController();
    let timedOut = false;
    let released = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      // Free the slot now: a client that stopped reading can block writeSSE past the abort.
      release();
    }, streamDeadlineMs);
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(deadline);
      abort.abort();
      const remaining = (openStreams.get(clientIp) ?? 1) - 1;
      if (remaining > 0) openStreams.set(clientIp, remaining);
      else openStreams.delete(clientIp);
    };

    // A synchronous throw is an adapter bug: free the slot and let onError answer 500.
    let chunks: AsyncIterable<GenerateChunk>;
    try {
      chunks = streamAdapter.stream(parsed.data, apiKey, abort.signal);
    } catch (error) {
      release();
      throw error;
    }

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => abort.abort());
      try {
        for await (const chunk of chunks) {
          if (chunk.type === "done") break;
          await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: chunk.text }) });
        }
        await stream.writeSSE({ event: "done", data: "{}" });
      } catch (error) {
        // Upstream messages can contain request details: log a marker only, send static text.
        log(`[${new Date(now()).toISOString()}] [stream_error] [-] [${providerId}] [-]`);
        const failure = timedOut
          ? { code: "STREAM_TIMEOUT", message: "The generation took too long" }
          : upstreamError(error);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ code: failure.code, message: failure.message }),
        });
      } finally {
        release();
      }
    });
  });

  app.get("/v1/models", async (c) => {
    const requested = c.req.query("provider");
    const providerId = PROVIDER_IDS.find((id) => id === requested);
    if (providerId === undefined) {
      return fail(c, 400, "BAD_REQUEST", `provider must be one of: ${PROVIDER_IDS.join(", ")}`);
    }
    c.set("provider", providerId);

    const apiKey = (c.req.header(KEY_HEADERS[providerId]) ?? "").trim();
    if (apiKey !== "" && !API_KEY_PATTERN.test(apiKey)) return invalidKey(c);
    if (apiKey === "") {
      return fail(
        c,
        400,
        "MISSING_API_KEY",
        `Provide your API key in the ${KEY_HEADERS[providerId]} header`,
      );
    }
    const adapter = providers[providerId];
    if (adapter === undefined) {
      return fail(
        c,
        501,
        "PROVIDER_NOT_IMPLEMENTED",
        `Provider "${providerId}" is not available yet`,
      );
    }

    try {
      const models = await adapter.listModels(
        apiKey,
        AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(MODELS_TIMEOUT_MS)]),
      );
      return c.json({ provider: providerId, models });
    } catch (error) {
      const failure = upstreamError(error);
      return fail(c, MODELS_STATUS[failure.kind], failure.code, failure.message);
    }
  });

  app.notFound((c) => fail(c, 404, "NOT_FOUND", "Route not found"));
  app.onError((_error, c) => fail(c, 500, "INTERNAL", "Internal server error"));

  return app;
}
