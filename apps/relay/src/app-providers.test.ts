import { describe, expect, it, vi } from "vitest";
import { type AppOptions, createApp } from "./app.js";
import {
  type GenerateChunk,
  type ModelInfo,
  type ProviderAdapter,
  ProviderError,
} from "./provider.js";

const SECRET_KEY = "sk-ant-SECRET-KEY-123";
const keyHeader = { "x-user-anthropic-key": SECRET_KEY };

const validRequest = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

/** An iterable whose first read rejects, standing in for a provider that fails. */
function failing(error: Error): AsyncIterable<GenerateChunk> {
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }) };
}

function adapterWith(overrides: Partial<ProviderAdapter> = {}): ProviderAdapter {
  const stream = (): AsyncIterable<GenerateChunk> =>
    (async function* () {
      yield { type: "done" } as const;
    })();
  return {
    id: "anthropic",
    stream,
    streamCompletion: stream,
    listModels: async () => [],
    ...overrides,
  };
}

function build(adapter: ProviderAdapter, overrides: Partial<AppOptions> = {}) {
  const logs: string[] = [];
  const app = createApp({
    providers: { anthropic: adapter },
    extensionIds: [],
    trustedHops: 0,
    log: (line) => logs.push(line),
    now: () => Date.UTC(2026, 0, 1),
    ...overrides,
  });
  return { app, logs };
}

function generate(app: ReturnType<typeof build>["app"], body: string | null = null) {
  return app.request("/v1/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...keyHeader },
    body: body ?? JSON.stringify(validRequest),
  });
}

/** Streams one delta, then waits until the signal aborts, as a stalled provider would. */
function stalled(): ProviderAdapter["stream"] {
  return (_request, _key, signal) =>
    (async function* (): AsyncGenerator<GenerateChunk> {
      yield { type: "delta", text: "partial" };
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    })();
}

describe("provider failure mapping on /v1/generate", () => {
  it.each([
    ["auth", "UPSTREAM_AUTH"],
    ["rate_limit", "UPSTREAM_RATE_LIMITED"],
    ["overloaded", "UPSTREAM_OVERLOADED"],
    ["invalid_request", "UPSTREAM_REJECTED"],
    ["upstream", "UPSTREAM_ERROR"],
    ["network", "UPSTREAM_ERROR"],
  ] as const)("reports a %s failure as %s with static text", async (kind, code) => {
    const adapter = adapterWith({
      stream: () => failing(new ProviderError(kind, 400)),
    });
    const { app } = build(adapter);
    const text = await (await generate(app)).text();
    expect(text).toContain("event: error");
    expect(text).toContain(code);
    expect(text).not.toContain(SECRET_KEY);
  });
});

describe("stream deadline", () => {
  it("aborts the provider call and reports STREAM_TIMEOUT", async () => {
    const seenSignals: AbortSignal[] = [];
    const base = stalled();
    const adapter = adapterWith({
      stream: (request, key, signal) => {
        seenSignals.push(signal);
        return base(request, key, signal);
      },
    });
    const { app } = build(adapter, { streamDeadlineMs: 30 });
    const text = await (await generate(app)).text();
    expect(text).toContain("event: delta");
    expect(text).toContain("STREAM_TIMEOUT");
    expect(seenSignals[0]?.aborted).toBe(true);
  });

  it("does not fire for a stream that finishes in time", async () => {
    const { app } = build(adapterWith(), { streamDeadlineMs: 5_000 });
    const text = await (await generate(app)).text();
    expect(text).toContain("event: done");
    expect(text).not.toContain("STREAM_TIMEOUT");
  });
});

describe("open stream cap", () => {
  it("refuses a generation beyond the per-IP cap, then frees the slot when streams end", async () => {
    const { app } = build(adapterWith({ stream: stalled() }), {
      streamDeadlineMs: 150,
      maxOpenStreamsPerIp: 2,
    });
    const first = generate(app);
    const second = generate(app);
    const third = await generate(app);
    expect(third.status).toBe(429);
    expect(((await third.json()) as { error: { code: string } }).error.code).toBe(
      "TOO_MANY_STREAMS",
    );

    await (await first).text();
    await (await second).text();
    const fourth = await generate(app);
    expect(fourth.status).toBe(200);
    await fourth.text();
  });

  it("frees the slot after a failed stream", async () => {
    const failingAdapter = adapterWith({
      stream: () => failing(new ProviderError("upstream")),
    });
    const { app } = build(failingAdapter, { maxOpenStreamsPerIp: 1 });
    for (let i = 0; i < 3; i++) {
      const res = await generate(app);
      expect(res.status).toBe(200);
      await res.text();
    }
  });
});

describe("body timeout", () => {
  it("answers 408 when the body never finishes arriving", async () => {
    const { app } = build(adapterWith(), { bodyTimeoutMs: 30 });
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"task":'));
      },
    });
    const res = await app.request("/v1/generate", {
      method: "POST",
      headers: { "content-type": "application/json", ...keyHeader },
      body: stalledBody,
      duplex: "half",
    } as RequestInit);
    expect(res.status).toBe(408);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("REQUEST_TIMEOUT");
  });
});

describe("API key validation", () => {
  it("rejects keys with spaces or over-long keys on both routes before any provider call", async () => {
    const stream = vi.fn();
    const listModels = vi.fn();
    const { app } = build(adapterWith({ stream, listModels }));
    for (const bad of ["sk ant", "x".repeat(513)]) {
      const generated = await app.request("/v1/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-anthropic-key": bad },
        body: JSON.stringify(validRequest),
      });
      expect(generated.status).toBe(400);
      expect(((await generated.json()) as { error: { code: string } }).error.code).toBe(
        "INVALID_API_KEY",
      );
      const models = await app.request("/v1/models?provider=anthropic", {
        headers: { "x-user-anthropic-key": bad },
      });
      expect(models.status).toBe(400);
    }
    expect(stream).not.toHaveBeenCalled();
    expect(listModels).not.toHaveBeenCalled();
  });
});

describe("GET /v1/models", () => {
  const models: ModelInfo[] = [{ id: "claude-opus-5-5", displayName: "Claude Opus 5.5" }];

  it("returns the provider's models using the key header", async () => {
    const listModels = vi.fn(async (_key: string) => models);
    const { app } = build(adapterWith({ listModels }));
    const res = await app.request("/v1/models?provider=anthropic", { headers: keyHeader });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: "anthropic", models });
    expect(listModels.mock.calls[0]?.[0]).toBe(SECRET_KEY);
  });

  it("rejects an unknown or missing provider", async () => {
    const { app } = build(adapterWith());
    for (const query of ["", "?provider=nope", "?provider=ANTHROPIC"]) {
      const res = await app.request(`/v1/models${query}`, { headers: keyHeader });
      expect(res.status).toBe(400);
    }
  });

  it("requires the key header for that provider", async () => {
    const { app } = build(adapterWith());
    const res = await app.request("/v1/models?provider=anthropic");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("MISSING_API_KEY");

    const wrongHeader = await app.request("/v1/models?provider=anthropic", {
      headers: { "x-user-openai-key": "sk-o" },
    });
    expect(wrongHeader.status).toBe(400);
  });

  it("answers 501 when the provider has no adapter", async () => {
    const { app } = build(adapterWith());
    const res = await app.request("/v1/models?provider=gemini", {
      headers: { "x-user-gemini-key": "g-key" },
    });
    expect(res.status).toBe(501);
  });

  it.each([
    ["auth", 401],
    ["rate_limit", 429],
    ["overloaded", 503],
    ["upstream", 502],
  ] as const)("maps a %s failure to HTTP %i without upstream text", async (kind, status) => {
    const { app } = build(
      adapterWith({
        listModels: async () => {
          throw new ProviderError(kind);
        },
      }),
    );
    const res = await app.request("/v1/models?provider=anthropic", { headers: keyHeader });
    expect(res.status).toBe(status);
    expect(await res.text()).not.toContain(SECRET_KEY);
  });

  it("logs the provider but never the key", async () => {
    const { app, logs } = build(adapterWith({ listModels: async () => models }));
    await app.request("/v1/models?provider=anthropic", { headers: keyHeader });
    expect(logs.join("\n")).toContain("[anthropic]");
    expect(logs.join("\n")).not.toContain(SECRET_KEY);
  });
});

describe("provider, model and effort on /v1/generate", () => {
  const models: ModelInfo[] = [
    { id: "claude-new", displayName: "New" },
    { id: "claude-old", displayName: "Old" },
  ];

  function withBody(extra: Record<string, unknown>) {
    return JSON.stringify({ ...validRequest, ...extra });
  }

  it("rejects a provider that does not match the key header", async () => {
    const { app } = build(adapterWith());
    const response = await generate(app, withBody({ provider: "openai" }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "PROVIDER_MISMATCH",
    );
  });

  it("accepts a provider that matches the key header", async () => {
    const { app } = build(adapterWith());
    expect((await generate(app, withBody({ provider: "anthropic" }))).status).toBe(200);
  });

  it("rejects a model that is not in the provider's list", async () => {
    const stream = vi.fn();
    const { app } = build(adapterWith({ listModels: async () => models, stream }));
    const response = await generate(app, withBody({ model: "claude-evil" }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "UNKNOWN_MODEL",
    );
    expect(stream).not.toHaveBeenCalled();
  });

  it("builds the adapter with the chosen model and effort when the model is listed", async () => {
    const created = vi.fn(() => adapterWith());
    const { app } = build(adapterWith({ listModels: async () => models }), {
      adapterFor: created,
    });
    const response = await generate(app, withBody({ model: "claude-old", effort: "low" }));
    expect(response.status).toBe(200);
    expect(created).toHaveBeenCalledWith("anthropic", { model: "claude-old", effort: "low" });
  });

  it("answers 500 rather than using the default model when no adapter can be built", async () => {
    const { app } = build(adapterWith({ listModels: async () => models }));
    expect((await generate(app, withBody({ model: "claude-old" }))).status).toBe(500);
    expect((await generate(app, withBody({ effort: "low" }))).status).toBe(500);
  });

  it("does not list models when the request names none", async () => {
    const listModels = vi.fn(async () => models);
    const { app } = build(adapterWith({ listModels }));
    await generate(app, withBody({ effort: "high" }));
    expect(listModels).not.toHaveBeenCalled();
  });

  it("maps a model-list failure to the static upstream error without the key", async () => {
    const { app } = build(
      adapterWith({ listModels: () => Promise.reject(new ProviderError("auth", 401)) }),
    );
    const response = await generate(app, withBody({ model: "claude-old" }));
    expect(response.status).toBe(401);
    const text = await response.text();
    expect(text).toContain("UPSTREAM_AUTH");
    expect(text).not.toContain(SECRET_KEY);
  });

  it("does not log the model name", async () => {
    const { app, logs } = build(adapterWith({ listModels: async () => models }));
    await generate(app, withBody({ model: "claude-evil" }));
    expect(logs.join("\n")).not.toContain("claude-evil");
  });
});
