import type { GenerateRequest } from "@slayply/core";
import { describe, expect, it, vi } from "vitest";
import { createClaudeAdapter } from "./claude.js";
import { type GenerateChunk, ProviderError } from "./types.js";

const KEY = "sk-ant-SECRET-KEY-123";

const request: GenerateRequest = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

function sse(events: Array<[string, unknown]>): string {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function textDelta(text: string): [string, unknown] {
  return [
    "content_block_delta",
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
  ];
}

const HAPPY_STREAM = sse([
  ["message_start", { type: "message_start", message: { id: "msg_1" } }],
  ["content_block_start", { type: "content_block_start", index: 0 }],
  ["ping", { type: "ping" }],
  textDelta("Hello"),
  [
    "content_block_delta",
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
  ],
  textDelta(" world"),
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" } }],
  ["message_stop", { type: "message_stop" }],
]);

const MODELS_BODY = {
  data: [
    { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", type: "model" },
    { id: "claude-sonnet-5-5", display_name: "Claude Sonnet 5.5", type: "model" },
    { display_name: "no id" },
  ],
  has_more: false,
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

function routed(handlers: { messages?: () => Response; models?: () => Response }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    if (href.includes("/v1/messages") && handlers.messages) return handlers.messages();
    if (href.includes("/v1/models") && handlers.models) return handlers.models();
    throw new Error(`unexpected request: ${href}`);
  });
}

describe("claude adapter: streaming", () => {
  it("streams only text deltas, in order, then done (chunk boundaries do not matter)", async () => {
    for (const chunkSize of [1, 7, 4096]) {
      const fetchMock = routed({ messages: () => streamResponse(HAPPY_STREAM, chunkSize) });
      const adapter = createClaudeAdapter({ fetch: fetchMock, model: "claude-sonnet-5-5" });
      const chunks = await drain(adapter.stream(request, KEY, new AbortController().signal));
      expect(chunks).toEqual([
        { type: "delta", text: "Hello" },
        { type: "delta", text: " world" },
        { type: "done" },
      ]);
    }
  });

  it("sends the documented headers, model, stream flag and prompt, and no sampling parameters", async () => {
    const fetchMock = routed({ messages: () => streamResponse(HAPPY_STREAM) });
    const adapter = createClaudeAdapter({ fetch: fetchMock, model: "claude-sonnet-5-5" });
    await drain(adapter.stream(request, KEY, new AbortController().signal));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBeUndefined();

    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(typeof body.system).toBe("string");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("top_p");
    expect(body).not.toHaveProperty("top_k");
  });

  it("adds the browser-access header only when asked (Direct Mode)", async () => {
    const fetchMock = routed({ messages: () => streamResponse(HAPPY_STREAM) });
    const adapter = createClaudeAdapter({
      fetch: fetchMock,
      model: "m",
      browserAccess: true,
    });
    await drain(adapter.stream(request, KEY, new AbortController().signal));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("uses the newest listed model when none is configured", async () => {
    const fetchMock = routed({
      messages: () => streamResponse(HAPPY_STREAM),
      models: () => json(MODELS_BODY),
    });
    const adapter = createClaudeAdapter({ fetch: fetchMock });
    await drain(adapter.stream(request, KEY, new AbortController().signal));
    const messageCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/v1/messages"));
    expect(JSON.parse(String(messageCall?.[1]?.body)).model).toBe("claude-opus-5-5");
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [400, "invalid_request"],
    [413, "invalid_request"],
    [429, "rate_limit"],
    [529, "overloaded"],
    [500, "upstream"],
    [503, "upstream"],
  ])("maps HTTP %i to the %s error kind without leaking upstream text", async (status, kind) => {
    const leak = `key ${KEY} rejected`;
    const fetchMock = routed({
      messages: () => json({ type: "error", error: { type: "x", message: leak } }, status),
    });
    const adapter = createClaudeAdapter({ fetch: fetchMock, model: "m" });
    const error = await drain(adapter.stream(request, KEY, new AbortController().signal)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect((error as ProviderError).message).not.toContain(KEY);
    expect((error as ProviderError).message).not.toContain("rejected");
  });

  it("maps a mid-stream overloaded error event", async () => {
    const body = sse([
      textDelta("partial"),
      ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }],
    ]);
    const adapter = createClaudeAdapter({
      fetch: routed({ messages: () => streamResponse(body) }),
      model: "m",
    });
    const seen: GenerateChunk[] = [];
    const run = async () => {
      for await (const chunk of adapter.stream(request, KEY, new AbortController().signal)) {
        seen.push(chunk);
      }
    };
    await expect(run()).rejects.toMatchObject({ kind: "overloaded" });
    expect(seen).toEqual([{ type: "delta", text: "partial" }]);
  });

  it("treats a stream that ends before message_stop as an upstream failure", async () => {
    const adapter = createClaudeAdapter({
      fetch: routed({ messages: () => streamResponse(sse([textDelta("cut off")])) }),
      model: "m",
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("treats non-JSON event data as an upstream failure", async () => {
    const adapter = createClaudeAdapter({
      fetch: routed({
        messages: () => streamResponse("event: content_block_delta\ndata: {not json\n\n"),
      }),
      model: "m",
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("maps a transport failure to the network kind, but rethrows an abort untouched", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const adapter = createClaudeAdapter({ fetch: failing, model: "m" });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "network" });

    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    const aborting = vi.fn(async () => {
      controller.abort();
      throw abortError;
    });
    const abortable = createClaudeAdapter({ fetch: aborting, model: "m" });
    await expect(drain(abortable.stream(request, KEY, controller.signal))).rejects.toBe(abortError);
  });
});

describe("claude adapter: models", () => {
  it("lists models from the endpoint, skipping malformed entries", async () => {
    const fetchMock = routed({ models: () => json(MODELS_BODY) });
    const adapter = createClaudeAdapter({ fetch: fetchMock });
    const models = await adapter.listModels(KEY, new AbortController().signal);
    expect(models).toEqual([
      { id: "claude-opus-5-5", displayName: "Claude Opus 5.5" },
      { id: "claude-sonnet-5-5", displayName: "Claude Sonnet 5.5" },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/models");
  });

  it("caches per key until the TTL expires, and never per another key", async () => {
    let time = 1_000;
    const fetchMock = routed({ models: () => json(MODELS_BODY) });
    const adapter = createClaudeAdapter({ fetch: fetchMock, now: () => time });
    const signal = new AbortController().signal;

    await adapter.listModels(KEY, signal);
    await adapter.listModels(KEY, signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await adapter.listModels("sk-ant-other", signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    time += 11 * 60_000;
    await adapter.listModels(KEY, signal);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps at most 200 models and rejects an oversized body", async () => {
    const many = { data: Array.from({ length: 300 }, (_, i) => ({ id: `m${i}` })) };
    const adapter = createClaudeAdapter({ fetch: routed({ models: () => json(many) }) });
    const models = await adapter.listModels(KEY, new AbortController().signal);
    expect(models).toHaveLength(200);

    const huge = createClaudeAdapter({
      fetch: routed({ models: () => json({ data: [], pad: "x".repeat(1_100_000) }) }),
    });
    await expect(huge.listModels(KEY, new AbortController().signal)).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("does not cache failures", async () => {
    const responses = [() => json({}, 500), () => json(MODELS_BODY)];
    const fetchMock = vi.fn(async () => (responses.shift() ?? (() => json(MODELS_BODY)))());
    const adapter = createClaudeAdapter({ fetch: fetchMock });
    const signal = new AbortController().signal;
    await expect(adapter.listModels(KEY, signal)).rejects.toMatchObject({ kind: "upstream" });
    await expect(adapter.listModels(KEY, signal)).resolves.toHaveLength(2);
  });

  it("rejects a malformed models body", async () => {
    const adapter = createClaudeAdapter({ fetch: routed({ models: () => json({ nope: true }) }) });
    await expect(adapter.listModels(KEY, new AbortController().signal)).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("fails cleanly when the account lists no models", async () => {
    const adapter = createClaudeAdapter({
      fetch: routed({ models: () => json({ data: [] }), messages: () => streamResponse("") }),
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("never stores the raw key in the cache", async () => {
    const adapter = createClaudeAdapter({ fetch: routed({ models: () => json(MODELS_BODY) }) });
    await adapter.listModels(KEY, new AbortController().signal);
    expect(JSON.stringify(Object.values(adapter))).not.toContain(KEY);
  });
});
