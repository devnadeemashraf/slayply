import { MAX_PAYLOAD_BYTES } from "@slayply/core";
import { describe, expect, it, vi } from "vitest";
import { type AppOptions, createApp } from "./app.js";
import type { GenerateChunk, ModelInfo, ProviderAdapter } from "./provider.js";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const SECRET_KEY = "sk-ant-SECRET-KEY-123";
const SECRET_JD = "UNIQUE-JOB-DESCRIPTION-MARKER";

const validRequest = {
  task: "cover_letter",
  job: { jd: SECRET_JD, company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

function fakeAdapter(
  id: ProviderAdapter["id"],
  chunks: GenerateChunk[] | (() => AsyncGenerator<GenerateChunk>),
): ProviderAdapter & { stream: ReturnType<typeof vi.fn> } {
  const stream = vi.fn((_req, _key, _signal) =>
    typeof chunks === "function"
      ? chunks()
      : (async function* () {
          for (const chunk of chunks) yield chunk;
        })(),
  );
  const listModels = vi.fn(async (_key: string, _signal: AbortSignal): Promise<ModelInfo[]> => []);
  return { id, stream, streamCompletion: stream, listModels };
}

function build(overrides: Partial<AppOptions> = {}) {
  const logs: string[] = [];
  let time = Date.UTC(2026, 0, 1);
  const app = createApp({
    providers: {},
    extensionIds: [EXT],
    trustedHops: 0,
    log: (line) => logs.push(line),
    now: () => time,
    ...overrides,
  });
  return {
    app,
    logs,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

function post(
  app: ReturnType<typeof build>["app"],
  body: string | Uint8Array | null,
  headers: Record<string, string> = {},
) {
  return app.request("/v1/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

const anthropicKey = { "x-user-anthropic-key": SECRET_KEY };

async function errorOf(res: Response) {
  return (await res.json()) as { error: { code: string; message: string; details: unknown[] } };
}

describe("GET /health", () => {
  it("returns ok with an ISO timestamp", async () => {
    const { app } = build();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", timestamp: "2026-01-01T00:00:00.000Z" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("answers unknown routes with the structured error shape", async () => {
    const { app } = build();
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect((await errorOf(res)).error.code).toBe("NOT_FOUND");
  });
});

describe("POST /v1/generate input handling", () => {
  it("rejects non-JSON content types with 415", async () => {
    const { app } = build();
    const res = await post(app, "hello", { "content-type": "text/plain", ...anthropicKey });
    expect(res.status).toBe(415);
    expect((await errorOf(res)).error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects binary bodies", async () => {
    const { app } = build({ providers: { anthropic: fakeAdapter("anthropic", []) } });
    const res = await post(app, new Uint8Array([0xff, 0xfe, 0x00, 0x80]), {
      "content-type": "application/octet-stream",
      ...anthropicKey,
    });
    expect(res.status).toBe(415);
    const asJson = await post(app, new Uint8Array([0xff, 0xfe, 0x00, 0x80]), anthropicKey);
    expect(asJson.status).toBe(400);
  });

  it("accepts a charset parameter on the content type", async () => {
    const { app } = build({ providers: { anthropic: fakeAdapter("anthropic", []) } });
    const res = await post(app, JSON.stringify(validRequest), {
      "content-type": "application/json; charset=utf-8",
      ...anthropicKey,
    });
    expect(res.status).toBe(200);
  });

  it("requires an API key header", async () => {
    const { app } = build();
    const res = await post(app, JSON.stringify(validRequest));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.code).toBe("MISSING_API_KEY");
  });

  it("rejects more than one provider key", async () => {
    const { app } = build();
    const res = await post(app, JSON.stringify(validRequest), {
      ...anthropicKey,
      "x-user-openai-key": "sk-other",
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.code).toBe("AMBIGUOUS_API_KEY");
  });

  it("treats a blank key header as missing", async () => {
    const { app } = build();
    const res = await post(app, JSON.stringify(validRequest), { "x-user-anthropic-key": "  " });
    expect((await errorOf(res)).error.code).toBe("MISSING_API_KEY");
  });

  it("rejects malformed JSON with 400", async () => {
    const { app } = build();
    const res = await post(app, "{not json", anthropicKey);
    expect(res.status).toBe(400);
    expect((await errorOf(res)).error.code).toBe("BAD_REQUEST");
  });

  it("rejects an empty body with 400", async () => {
    const { app } = build();
    const res = await post(app, "", anthropicKey);
    expect(res.status).toBe(400);
  });

  it("rejects schema violations with issue details and no echoed input", async () => {
    const { app } = build();
    const res = await post(
      app,
      JSON.stringify({ ...validRequest, task: "write_poem", extra: SECRET_JD }),
      anthropicKey,
    );
    expect(res.status).toBe(400);
    const body = await errorOf(res);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.details.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toContain(SECRET_JD);
  });

  it("answers 501 when no adapter exists for the key's provider", async () => {
    const { app } = build();
    const res = await post(app, JSON.stringify(validRequest), anthropicKey);
    expect(res.status).toBe(501);
    expect((await errorOf(res)).error.code).toBe("PROVIDER_NOT_IMPLEMENTED");
  });
});

describe("POST /v1/generate streaming", () => {
  it("streams adapter chunks as SSE and passes the key and parsed request through", async () => {
    const adapter = fakeAdapter("anthropic", [
      { type: "delta", text: "Hello " },
      { type: "delta", text: "world" },
      { type: "done" },
    ]);
    const { app } = build({ providers: { anthropic: adapter } });
    const res = await post(app, JSON.stringify(validRequest), anthropicKey);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain('event: delta\ndata: {"text":"Hello "}');
    expect(text).toContain('event: delta\ndata: {"text":"world"}');
    expect(text.trimEnd().endsWith("event: done\ndata: {}")).toBe(true);
    const [request, key, signal] = adapter.stream.mock.calls[0] ?? [];
    expect(request.task).toBe("cover_letter");
    expect(key).toBe(SECRET_KEY);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("picks the adapter that matches the key header", async () => {
    const anthropic = fakeAdapter("anthropic", [{ type: "done" }]);
    const openai = fakeAdapter("openai", [{ type: "done" }]);
    const { app } = build({ providers: { anthropic, openai } });
    await (await post(app, JSON.stringify(validRequest), { "x-user-openai-key": "sk-o" })).text();
    expect(openai.stream).toHaveBeenCalledOnce();
    expect(anthropic.stream).not.toHaveBeenCalled();
  });

  it("reports a mid-stream failure as a generic error event without upstream text", async () => {
    const adapter = fakeAdapter("anthropic", async function* () {
      yield { type: "delta", text: "partial" };
      throw new Error(`upstream rejected ${SECRET_KEY}`);
    });
    const { app, logs } = build({ providers: { anthropic: adapter } });
    const res = await post(app, JSON.stringify(validRequest), anthropicKey);
    const text = await res.text();
    expect(text).toContain("event: error");
    expect(text).toContain("UPSTREAM_ERROR");
    expect(text).not.toContain(SECRET_KEY);
    expect(logs.join("\n")).not.toContain(SECRET_KEY);
    expect(logs.some((line) => /\[stream_error\] \[-\] \[anthropic\]/.test(line))).toBe(true);
  });
});

describe("size cap", () => {
  it("rejects a declared oversize body with 413 before reading it", async () => {
    const adapter = fakeAdapter("anthropic", []);
    const { app } = build({ providers: { anthropic: adapter } });
    const res = await post(app, "x", {
      ...anthropicKey,
      "content-length": String(MAX_PAYLOAD_BYTES + 1),
    });
    expect(res.status).toBe(413);
    expect((await errorOf(res)).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(adapter.stream).not.toHaveBeenCalled();
  });

  it("rejects an oversize body whose Content-Length lies or is absent", async () => {
    const { app } = build();
    const big = JSON.stringify({ ...validRequest, pad: "x".repeat(MAX_PAYLOAD_BYTES) });
    const lying = await post(app, big, { ...anthropicKey, "content-length": "10" });
    expect(lying.status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const chunked = await app.request("/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json", ...anthropicKey },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(chunked.status).toBe(413);
  });

  it("accepts a body right under the cap", async () => {
    const { app } = build();
    const padding = " ".repeat(MAX_PAYLOAD_BYTES - JSON.stringify(validRequest).length);
    const res = await post(app, JSON.stringify(validRequest) + padding, anthropicKey);
    expect(res.status).toBe(501);
  });
});

describe("CORS", () => {
  it("echoes an allowed extension origin and varies on Origin", async () => {
    const { app } = build();
    const res = await app.request("/health", { headers: { origin: `chrome-extension://${EXT}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(`chrome-extension://${EXT}`);
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("allows localhost with a port", async () => {
    const { app } = build();
    const res = await app.request("/health", { headers: { origin: "http://localhost:5173" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("refuses disallowed origins with 403 and no CORS headers", async () => {
    const { app } = build();
    for (const origin of ["https://evil.com", "http://localhost.evil.com", "null"]) {
      const res = await app.request("/health", { headers: { origin } });
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
      expect((await errorOf(res)).error.code).toBe("FORBIDDEN_ORIGIN");
    }
  });

  it("serves requests without an Origin header", async () => {
    const { app } = build();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers an allowed preflight and lists the key headers", async () => {
    const { app } = build();
    const res = await app.request("/v1/generate", {
      method: "OPTIONS",
      headers: {
        origin: `chrome-extension://${EXT}`,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-user-anthropic-key",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(`chrome-extension://${EXT}`);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    const allowed = res.headers.get("access-control-allow-headers")?.toLowerCase() ?? "";
    for (const name of [
      "content-type",
      "x-user-anthropic-key",
      "x-user-openai-key",
      "x-user-gemini-key",
    ]) {
      expect(allowed).toContain(name);
    }
  });

  it("refuses a preflight from a disallowed origin", async () => {
    const { app } = build();
    const res = await app.request("/v1/generate", {
      method: "OPTIONS",
      headers: { origin: "https://evil.com", "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(403);
  });

  it("never sends a wildcard origin", async () => {
    const { app } = build();
    const res = await app.request("/health", { headers: { origin: "http://localhost:3000" } });
    expect(res.headers.get("access-control-allow-origin")).not.toBe("*");
  });
});

describe("rate limiting", () => {
  it("allows 60 requests per minute per IP and then answers 429 with Retry-After", async () => {
    const { app, advance } = build();
    for (let i = 0; i < 60; i += 1) {
      expect((await app.request("/health")).status).toBe(200);
    }
    const denied = await app.request("/health");
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
    expect((await errorOf(denied)).error.code).toBe("RATE_LIMITED");
    advance(60_000);
    expect((await app.request("/health")).status).toBe(200);
  });

  it("includes CORS headers on 429 so the extension can read it", async () => {
    const { app } = build({ rateLimit: { limit: 1, windowMs: 60_000 } });
    const headers = { origin: `chrome-extension://${EXT}` };
    await app.request("/health", { headers });
    const denied = await app.request("/health", { headers });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("access-control-allow-origin")).toBe(`chrome-extension://${EXT}`);
  });

  it("cannot be dodged by spoofing X-Forwarded-For when no proxy is trusted", async () => {
    const { app } = build({ rateLimit: { limit: 2, windowMs: 60_000 } });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await app.request("/health", { headers: { "x-forwarded-for": `9.9.9.${i}` } });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 429, 429]);
  });

  it("keys on the proxy-appended address when a proxy is trusted", async () => {
    const { app } = build({ trustedHops: 1, rateLimit: { limit: 1, windowMs: 60_000 } });
    const hit = (client: string) =>
      app.request("/health", { headers: { "x-forwarded-for": `${client}, 203.0.113.${client}` } });
    expect((await hit("1")).status).toBe(200);
    expect((await hit("1")).status).toBe(429);
    expect((await hit("2")).status).toBe(200);
  });

  it("counts preflights and disallowed-origin requests against the limit", async () => {
    const { app } = build({ rateLimit: { limit: 2, windowMs: 60_000 } });
    const preflight = { method: "OPTIONS", headers: { origin: `chrome-extension://${EXT}` } };
    expect((await app.request("/v1/generate", preflight)).status).toBe(204);
    expect((await app.request("/health", { headers: { origin: "https://evil.com" } })).status).toBe(
      403,
    );
    const denied = await app.request("/v1/generate", preflight);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("access-control-allow-origin")).toBe(`chrome-extension://${EXT}`);
  });

  it("does not grant CORS headers to a disallowed origin even when rate limited", async () => {
    const { app } = build({ rateLimit: { limit: 1, windowMs: 60_000 } });
    const headers = { origin: "https://evil.com" };
    await app.request("/health", { headers });
    const denied = await app.request("/health", { headers });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("limits requests that are later rejected too", async () => {
    const { app } = build({ rateLimit: { limit: 1, windowMs: 60_000 } });
    await post(app, "{bad", anthropicKey);
    expect((await post(app, "{bad", anthropicKey)).status).toBe(429);
  });
});

describe("logging", () => {
  it("logs one metadata line per request and never keys or payloads", async () => {
    const adapter = fakeAdapter("anthropic", [
      { type: "delta", text: "reply-text" },
      { type: "done" },
    ]);
    const { app, logs } = build({ providers: { anthropic: adapter } });
    await (await post(app, JSON.stringify(validRequest), anthropicKey)).text();
    await post(app, "{bad", { ...anthropicKey, "x-user-openai-key": "sk-other-KEY" });
    await app.request("/health", { headers: { origin: "https://evil.com" } });

    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[200\] \[\d+\] \[anthropic\] \[-\]$/);
    expect(logs[1]).toMatch(/\[400\] \[\d+\] \[-\] \[-\]$/);
    expect(logs[2]).toMatch(/\[403\]/);
    const all = logs.join("\n");
    for (const forbidden of [
      SECRET_KEY,
      "sk-other-KEY",
      SECRET_JD,
      "Acme",
      "reply-text",
      "Ten years",
    ]) {
      expect(all).not.toContain(forbidden);
    }
  });

  it("logs unexpected failures as 500 without the error message", async () => {
    const adapter: ProviderAdapter = {
      id: "anthropic",
      stream: () => {
        throw new Error(`boom ${SECRET_KEY}`);
      },
      streamCompletion: vi.fn(),
      listModels: vi.fn(),
    };
    const { app, logs } = build({ providers: { anthropic: adapter } });
    const res = await post(app, JSON.stringify(validRequest), anthropicKey);
    expect(res.status).toBe(500);
    const body = await errorOf(res);
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain(SECRET_KEY);
    expect(logs.join("\n")).not.toContain(SECRET_KEY);
    expect(logs[0]).toMatch(/\[500\]/);
  });
});
