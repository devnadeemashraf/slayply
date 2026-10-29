import type { GenerateRequest } from "@slayply/core";
import { describe, expect, it, vi } from "vitest";
import { createGeminiAdapter, supportsThinking } from "./gemini.js";
import { type GenerateChunk, ProviderError } from "./types.js";

const KEY = "AIza-SECRET-KEY-123";

const request: GenerateRequest = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

function frame(parts: unknown[], finishReason?: string): string {
  const candidate: Record<string, unknown> = { content: { role: "model", parts } };
  if (finishReason !== undefined) candidate.finishReason = finishReason;
  return `data: ${JSON.stringify({ candidates: [candidate] })}\r\n\r\n`;
}

function text(t: string, finishReason?: string): string {
  return frame([{ text: t }], finishReason);
}

const HAPPY_STREAM = [
  frame([{ text: "pondering", thought: true }]),
  text("Hello"),
  text(" world", "STOP"),
].join("");

const MODELS_BODY = {
  models: [
    {
      name: "models/gemini-2.0-flash",
      displayName: "Gemini 2.0 Flash",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      supportedGenerationMethods: ["generateContent", "countTokens"],
    },
    {
      name: "models/text-embedding-004",
      displayName: "Embedding",
      supportedGenerationMethods: ["embedContent"],
    },
    {
      name: "models/gemini-2.5-flash-image",
      displayName: "Image",
      supportedGenerationMethods: ["generateContent"],
    },
    {
      name: "models/gemini-3-pro",
      displayName: "Gemini 3 Pro",
      supportedGenerationMethods: ["generateContent"],
    },
    { name: "models/gemini-1.5-pro", supportedGenerationMethods: ["generateContent"] },
    { displayName: "no name" },
  ],
};

function streamResponse(body: string, chunkSize = 7): Response {
  const bytes = new TextEncoder().encode(body);
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) {
          controller.enqueue(bytes.slice(i, i + chunkSize));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function drain(chunks: AsyncIterable<GenerateChunk>): Promise<GenerateChunk[]> {
  const out: GenerateChunk[] = [];
  for await (const chunk of chunks) out.push(chunk);
  return out;
}

function routed(handlers: { generate?: () => Response; models?: () => Response }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    if (href.includes(":streamGenerateContent") && handlers.generate) return handlers.generate();
    if (href.includes("/v1beta/models") && handlers.models) return handlers.models();
    throw new Error(`unexpected request: ${href}`);
  });
}

type SentBody = {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: string }>;
  generationConfig: { maxOutputTokens: number; thinkingConfig?: unknown };
};

function sentBody(fetchMock: ReturnType<typeof routed>): SentBody {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes(":streamGenerateContent"));
  return JSON.parse(String(call?.[1]?.body));
}

const signal = () => new AbortController().signal;

describe("gemini adapter: streaming", () => {
  it("streams only non-thought text, in order, then done (chunk boundaries do not matter)", async () => {
    for (const chunkSize of [1, 7, 4096]) {
      const fetchMock = routed({ generate: () => streamResponse(HAPPY_STREAM, chunkSize) });
      const adapter = createGeminiAdapter({ fetch: fetchMock, model: "gemini-2.0-flash" });
      expect(await drain(adapter.stream(request, KEY, signal()))).toEqual([
        { type: "delta", text: "Hello" },
        { type: "delta", text: " world" },
        { type: "done" },
      ]);
    }
  });

  it("sends the key in a header (never the URL), the model path, SSE flag and prompt", async () => {
    const fetchMock = routed({ generate: () => streamResponse(HAPPY_STREAM) });
    const adapter = createGeminiAdapter({ fetch: fetchMock, model: "gemini-2.0-flash" });
    await drain(adapter.stream(request, KEY, signal()));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse",
    );
    expect(String(url)).not.toContain(KEY);
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["x-goog-api-key"]).toBe(KEY);
    expect(headers?.["content-type"]).toBe("application/json");

    const body = sentBody(fetchMock);
    expect(typeof body.systemInstruction.parts[0]?.text).toBe("string");
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0]?.role).toBe("user");
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThan(0);
    expect(body.generationConfig).not.toHaveProperty("thinkingConfig");
    expect(body.generationConfig).not.toHaveProperty("temperature");
  });

  it("maps the assistant role to model in a repair conversation", async () => {
    const fetchMock = routed({ generate: () => streamResponse(HAPPY_STREAM) });
    const adapter = createGeminiAdapter({ fetch: fetchMock, model: "gemini-2.0-flash" });
    await drain(
      adapter.streamCompletion(
        {
          system: "sys",
          messages: [
            { role: "user", content: "q" },
            { role: "assistant", content: "bad" },
            { role: "user", content: "fix" },
          ],
        },
        KEY,
        signal(),
      ),
    );
    expect(sentBody(fetchMock).contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("uses the newest listed model when none is configured", async () => {
    const fetchMock = routed({
      generate: () => streamResponse(HAPPY_STREAM),
      models: () => json(MODELS_BODY),
    });
    const adapter = createGeminiAdapter({ fetch: fetchMock });
    await drain(adapter.stream(request, KEY, signal()));
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes(":streamGenerate"));
    expect(String(call?.[0])).toContain("/models/gemini-3-pro:streamGenerateContent");
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [404, "invalid_request"],
    [413, "invalid_request"],
    [429, "rate_limit"],
    [503, "overloaded"],
    [500, "upstream"],
  ])("maps HTTP %i to the %s error kind without leaking upstream text", async (status, kind) => {
    const fetchMock = routed({
      generate: () => json({ error: { message: `bad key ${KEY}`, status: "X" } }, status),
    });
    const adapter = createGeminiAdapter({ fetch: fetchMock, model: "m" });
    const error = await drain(adapter.stream(request, KEY, signal())).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect((error as ProviderError).message).not.toContain(KEY);
  });

  it("never echoes the key from a 400 body", async () => {
    const adapter = createGeminiAdapter({
      fetch: routed({
        generate: () => json({ error: { message: `key ${KEY} rejected`, status: "X" } }, 400),
      }),
      model: "m",
    });
    const error = await drain(adapter.stream(request, KEY, signal())).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect((error as ProviderError).message).not.toContain(KEY);
  });

  it("maps a 400 for an invalid key to auth, and any other 400 to invalid_request", async () => {
    const badKey = json(
      {
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
          details: [{ reason: "API_KEY_INVALID" }],
        },
      },
      400,
    );
    const adapter = createGeminiAdapter({ fetch: routed({ generate: () => badKey }), model: "m" });
    await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "auth",
    });

    const other = createGeminiAdapter({
      fetch: routed({ generate: () => json({ error: { status: "INVALID_ARGUMENT" } }, 400) }),
      model: "m",
    });
    await expect(drain(other.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "invalid_request",
    });
  });

  it.each([
    ["RESOURCE_EXHAUSTED", "rate_limit"],
    ["UNAVAILABLE", "overloaded"],
    ["UNAUTHENTICATED", "auth"],
    ["PERMISSION_DENIED", "auth"],
    ["INTERNAL", "upstream"],
  ])(
    "maps the mid-stream error status %s to %s and keeps the text already sent",
    async (status, kind) => {
      const body = `${text("partial")}data: ${JSON.stringify({ error: { code: 1, status, message: "m" } })}\n\n`;
      const adapter = createGeminiAdapter({
        fetch: routed({ generate: () => streamResponse(body) }),
        model: "m",
      });
      const seen: GenerateChunk[] = [];
      const run = async () => {
        for await (const chunk of adapter.stream(request, KEY, signal())) seen.push(chunk);
      };
      await expect(run()).rejects.toMatchObject({ kind });
      expect(seen).toEqual([{ type: "delta", text: "partial" }]);
    },
  );

  it.each(["MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "PROHIBITED_CONTENT"])(
    "treats finishReason %s as an upstream failure, not a complete reply",
    async (reason) => {
      const adapter = createGeminiAdapter({
        fetch: routed({ generate: () => streamResponse(text("partial", reason)) }),
        model: "m",
      });
      await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
        kind: "upstream",
      });
    },
  );

  it("treats a stream that ends before a STOP finish as an upstream failure", async () => {
    const adapter = createGeminiAdapter({
      fetch: routed({ generate: () => streamResponse(text("cut off")) }),
      model: "m",
    });
    await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("treats a blocked prompt (no candidates) as an upstream failure", async () => {
    const body = `data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}\n\n`;
    const adapter = createGeminiAdapter({
      fetch: routed({ generate: () => streamResponse(body) }),
      model: "m",
    });
    await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("treats non-JSON event data as an upstream failure", async () => {
    const adapter = createGeminiAdapter({
      fetch: routed({ generate: () => streamResponse("data: {not json\n\n") }),
      model: "m",
    });
    await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("maps a transport failure to the network kind, but rethrows an abort untouched", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const adapter = createGeminiAdapter({ fetch: failing, model: "m" });
    await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "network",
    });

    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    const aborting = vi.fn(async () => {
      controller.abort();
      throw abortError;
    });
    const abortable = createGeminiAdapter({ fetch: aborting, model: "m" });
    await expect(drain(abortable.stream(request, KEY, controller.signal))).rejects.toBe(abortError);
  });
});

describe("gemini adapter: thinking effort", () => {
  it.each([
    ["gemini-2.5-pro", true],
    ["gemini-2.5-flash", true],
    ["gemini-3-pro", true],
    ["gemini-2.0-flash", false],
    ["gemini-1.5-pro", false],
    ["gemini-2.5-flash-image", false],
    ["gemini-2.5-flash-preview-tts", false],
  ])("supportsThinking(%s) is %s", (id, expected) => {
    expect(supportsThinking(id)).toBe(expected);
  });

  it.each([
    ["low", 1024],
    ["medium", 8192],
    ["high", 24576],
  ] as const)("sends a %s thinking budget of %i tokens to a 2.5 model", async (effort, budget) => {
    const fetchMock = routed({ generate: () => streamResponse(HAPPY_STREAM) });
    const adapter = createGeminiAdapter({ fetch: fetchMock, model: "gemini-2.5-flash", effort });
    await drain(adapter.stream(request, KEY, signal()));
    expect(sentBody(fetchMock).generationConfig.thinkingConfig).toEqual({ thinkingBudget: budget });
  });

  it.each([
    ["low", "low"],
    ["medium", "high"],
    ["high", "high"],
  ] as const)("sends effort %s as thinkingLevel %s to a Gemini 3 model", async (effort, level) => {
    const fetchMock = routed({ generate: () => streamResponse(HAPPY_STREAM) });
    const adapter = createGeminiAdapter({ fetch: fetchMock, model: "gemini-3-pro", effort });
    await drain(adapter.stream(request, KEY, signal()));
    expect(sentBody(fetchMock).generationConfig.thinkingConfig).toEqual({ thinkingLevel: level });
  });

  it("leaves effort out for a model that does not support it", async () => {
    const fetchMock = routed({ generate: () => streamResponse(HAPPY_STREAM) });
    const adapter = createGeminiAdapter({
      fetch: fetchMock,
      model: "gemini-2.0-flash",
      effort: "high",
    });
    await drain(adapter.stream(request, KEY, signal()));
    expect(sentBody(fetchMock).generationConfig).not.toHaveProperty("thinkingConfig");
  });
});

describe("gemini adapter: models", () => {
  it("keeps text-generation models only, newest version first, and flags effort support", async () => {
    const fetchMock = routed({ models: () => json(MODELS_BODY) });
    const adapter = createGeminiAdapter({ fetch: fetchMock });
    const models = await adapter.listModels(KEY, signal());
    expect(models).toEqual([
      { id: "gemini-3-pro", displayName: "Gemini 3 Pro", supportsEffort: true },
      { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportsEffort: true },
      { id: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportsEffort: false },
      { id: "gemini-1.5-pro", displayName: "gemini-1.5-pro", supportsEffort: false },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/v1beta/models?pageSize=");
    expect(String(url)).not.toContain(KEY);
    expect((init?.headers as Record<string, string> | undefined)?.["x-goog-api-key"]).toBe(KEY);
  });

  it("puts lite and preview models after full ones of the same version (the default pick)", async () => {
    const methods = ["generateContent"];
    const body = {
      models: [
        { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: methods },
        { name: "models/gemini-2.5-pro-preview", supportedGenerationMethods: methods },
        { name: "models/gemini-2.5-pro", supportedGenerationMethods: methods },
      ],
    };
    const adapter = createGeminiAdapter({ fetch: routed({ models: () => json(body) }) });
    const ids = (await adapter.listModels(KEY, signal())).map((m) => m.id);
    expect(ids[0]).toBe("gemini-2.5-pro");
  });

  it("caches per key until the TTL expires, and never per another key", async () => {
    let time = 1_000;
    const fetchMock = routed({ models: () => json(MODELS_BODY) });
    const adapter = createGeminiAdapter({ fetch: fetchMock, now: () => time });
    await adapter.listModels(KEY, signal());
    await adapter.listModels(KEY, signal());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await adapter.listModels("AIza-other", signal());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    time += 11 * 60_000;
    await adapter.listModels(KEY, signal());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps at most 200 models and rejects an oversized body", async () => {
    const many = {
      models: Array.from({ length: 300 }, (_, i) => ({
        name: `models/gemini-2.${i}-x`,
        supportedGenerationMethods: ["generateContent"],
      })),
    };
    const adapter = createGeminiAdapter({ fetch: routed({ models: () => json(many) }) });
    expect(await adapter.listModels(KEY, signal())).toHaveLength(200);

    const huge = createGeminiAdapter({
      fetch: routed({ models: () => json({ models: [], pad: "x".repeat(1_100_000) }) }),
    });
    await expect(huge.listModels(KEY, signal())).rejects.toMatchObject({ kind: "upstream" });
  });

  it("does not cache failures", async () => {
    const responses = [() => json({}, 500), () => json(MODELS_BODY)];
    const fetchMock = vi.fn(async () => (responses.shift() ?? (() => json(MODELS_BODY)))());
    const adapter = createGeminiAdapter({ fetch: fetchMock });
    await expect(adapter.listModels(KEY, signal())).rejects.toMatchObject({ kind: "upstream" });
    await expect(adapter.listModels(KEY, signal())).resolves.toHaveLength(4);
  });

  it("rejects a malformed models body", async () => {
    const adapter = createGeminiAdapter({ fetch: routed({ models: () => json({ nope: true }) }) });
    await expect(adapter.listModels(KEY, signal())).rejects.toMatchObject({ kind: "upstream" });
  });

  it("fails cleanly when the account lists no text models", async () => {
    const adapter = createGeminiAdapter({
      fetch: routed({
        models: () => json({ models: [{ name: "models/text-embedding-004" }] }),
        generate: () => streamResponse(""),
      }),
    });
    await expect(drain(adapter.stream(request, KEY, signal()))).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("never stores the raw key in the cache", async () => {
    const stored: unknown[] = [];
    const original = Map.prototype.set;
    const spy = vi.spyOn(Map.prototype, "set").mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown,
    ) {
      stored.push(key);
      return original.call(this, key, value);
    });
    try {
      const adapter = createGeminiAdapter({ fetch: routed({ models: () => json(MODELS_BODY) }) });
      await adapter.listModels(KEY, signal());
    } finally {
      spy.mockRestore();
    }
    expect(stored.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored)).not.toContain(KEY);
  });
});
