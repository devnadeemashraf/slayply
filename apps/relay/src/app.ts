import type { HttpBindings } from "@hono/node-server";
import { MAX_PAYLOAD_BYTES, validateGenerateRequest } from "@slayply/core";
import { type Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { readBodyText } from "./body.js";
import { resolveClientIp } from "./client-ip.js";
import { isAllowedOrigin } from "./cors.js";
import { KEY_HEADERS, PROVIDER_IDS, type ProviderId, type ProviderRegistry } from "./provider.js";
import { createRateLimiter } from "./rate-limit.js";

export type AppOptions = {
  providers: ProviderRegistry;
  extensionIds: readonly string[];
  trustedHops: number;
  /** Receives one metadata-only line per request. */
  log: (line: string) => void;
  now: () => number;
  rateLimit?: { limit: number; windowMs: number };
};

type RelayEnv = {
  Bindings: Partial<HttpBindings>;
  Variables: { provider?: ProviderId };
};

const DEFAULT_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const MAX_TRACKED_IPS = 10_000;
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

    const decision = limiter.check(
      resolveClientIp({
        forwardedFor: c.req.header("x-forwarded-for"),
        socketAddress: c.env?.incoming?.socket?.remoteAddress,
        trustedHops,
      }),
    );
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

    const body = await readBodyText(c.req.raw, MAX_PAYLOAD_BYTES);
    if (!body.ok) {
      return body.reason === "too_large"
        ? tooLarge()
        : fail(c, 400, "BAD_REQUEST", "Body must be valid UTF-8 text");
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
    const abort = new AbortController();
    const chunks = adapter.stream(parsed.data, apiKey, abort.signal);

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => abort.abort());
      try {
        for await (const chunk of chunks) {
          if (chunk.type === "done") break;
          await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: chunk.text }) });
        }
        await stream.writeSSE({ event: "done", data: "{}" });
      } catch {
        // Upstream messages can contain request details: log a marker only, send a generic event.
        log(`[${new Date(now()).toISOString()}] [stream_error] [-] [${providerId}] [-]`);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ code: "UPSTREAM_ERROR", message: "The provider request failed" }),
        });
      } finally {
        abort.abort();
      }
    });
  });

  app.notFound((c) => fail(c, 404, "NOT_FOUND", "Route not found"));
  app.onError((_error, c) => fail(c, 500, "INTERNAL", "Internal server error"));

  return app;
}
