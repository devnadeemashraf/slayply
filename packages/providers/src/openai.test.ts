import type { GenerateRequest } from "@slayply/core";
import { describe, expect, it, vi } from "vitest";
import { createOpenAiAdapter, supportsReasoningEffort } from "./openai.js";
import { type GenerateChunk, ProviderError } from "./types.js";

const KEY = "sk-proj-SECRET-KEY-123";

const request: GenerateRequest = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

function data(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function delta(content: string): string {
  return data({ id: "c1", choices: [{ index: 0, delta: { content }, finish_reason: null }] });
}

const HAPPY_STREAM = [
  data({ id: "c1", choices: [{ index: 0, delta: { role: "assistant", content: "" } }] }),
  delta("Hello"),
  data({ id: "c1", choices: [{ index: 0, delta: { refusal: null } }] }),
  delta(" world"),
  data({ id: "c1", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
  "data: [DONE]\n\n",
].join("");

const MODELS_BODY = {
  object: "list",
  data: [
    { id: "gpt-4o", object: "model", created: 100, owned_by: "system" },
    { id: "text-embedding-3-small", created: 400, owned_by: "system" },
    { id: "gpt-5", created: 300, owned_by: "system" },
    { id: "whisper-1", created: 500, owned_by: "openai-internal" },
    { id: "o3-mini", created: 200, owned_by: "system" },
    { id: "gpt-4o-realtime-preview", created: 450, owned_by: "system" },
    { id: "gpt-4o-mini-tts", created: 460, owned_by: "system" },
    { id: "o3-pro", created: 900 },
    { id: "gpt-5-pro", created: 910 },
    { created: 1 },
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

function routed(handlers: { completions?: () => Response; models?: () => Response }) {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    if (href.includes("/v1/chat/completions") && handlers.completions)
      return handlers.completions();
    if (href.includes("/v1/models") && handlers.models) return handlers.models();
    throw new Error(`unexpected request: ${href}`);
  });
}

function sentBody(fetchMock: ReturnType<typeof routed>): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/chat/completions"));
  return JSON.parse(String(call?.[1]?.body));
}

describe("openai adapter: streaming", () => {
  it("streams only content deltas, in order, then done (chunk boundaries do not matter)", async () => {
    for (const chunkSize of [1, 7, 4096]) {
      const fetchMock = routed({ completions: () => streamResponse(HAPPY_STREAM, chunkSize) });
      const adapter = createOpenAiAdapter({ fetch: fetchMock, model: "gpt-4o" });
      const chunks = await drain(adapter.stream(request, KEY, new AbortController().signal));
      expect(chunks).toEqual([
        { type: "delta", text: "Hello" },
        { type: "delta", text: " world" },
        { type: "done" },
      ]);
    }
  });

  it("sends the bearer key, model, stream flag, system prompt and messages", async () => {
    const fetchMock = routed({ completions: () => streamResponse(HAPPY_STREAM) });
    const adapter = createOpenAiAdapter({ fetch: fetchMock, model: "gpt-4o" });
    await drain(adapter.stream(request, KEY, new AbortController().signal));

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(headers["content-type"]).toBe("application/json");

    const body = sentBody(fetchMock);
    expect(body.model).toBe("gpt-4o");
    expect(body.stream).toBe(true);
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("sends a repair conversation in order after the system message", async () => {
    const fetchMock = routed({ completions: () => streamResponse(HAPPY_STREAM) });
    const adapter = createOpenAiAdapter({ fetch: fetchMock, model: "gpt-4o" });
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
        new AbortController().signal,
      ),
    );
    const messages = sentBody(fetchMock).messages as Array<{ role: string }>;
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
  });

  it("uses the newest listed chat model when none is configured", async () => {
    const fetchMock = routed({
      completions: () => streamResponse(HAPPY_STREAM),
      models: () => json(MODELS_BODY),
    });
    const adapter = createOpenAiAdapter({ fetch: fetchMock });
    await drain(adapter.stream(request, KEY, new AbortController().signal));
    expect(sentBody(fetchMock).model).toBe("gpt-5");
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [400, "invalid_request"],
    [413, "invalid_request"],
    [429, "rate_limit"],
    [503, "overloaded"],
    [500, "upstream"],
    [502, "upstream"],
  ])("maps HTTP %i to the %s error kind without leaking upstream text", async (status, kind) => {
    const leak = `Incorrect API key provided: ${KEY}`;
    const fetchMock = routed({
      completions: () => json({ error: { message: leak, type: "x", code: "y" } }, status),
    });
    const adapter = createOpenAiAdapter({ fetch: fetchMock, model: "gpt-4o" });
    const error = await drain(adapter.stream(request, KEY, new AbortController().signal)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect((error as ProviderError).message).not.toContain(KEY);
    expect((error as ProviderError).message).not.toContain("Incorrect");
  });

  it("maps a mid-stream error event and keeps the text already sent", async () => {
    const body = `${delta("partial")}${data({ error: { type: "server_error", message: "boom" } })}`;
    const adapter = createOpenAiAdapter({
      fetch: routed({ completions: () => streamResponse(body) }),
      model: "gpt-4o",
    });
    const seen: GenerateChunk[] = [];
    const run = async () => {
      for await (const chunk of adapter.stream(request, KEY, new AbortController().signal)) {
        seen.push(chunk);
      }
    };
    await expect(run()).rejects.toMatchObject({ kind: "upstream" });
    expect(seen).toEqual([{ type: "delta", text: "partial" }]);
  });

  it.each([
    ["rate_limit_exceeded", "rate_limit"],
    ["insufficient_quota", "rate_limit"],
    ["invalid_api_key", "auth"],
  ])("maps the mid-stream error code %s to %s", async (code, kind) => {
    const body = data({ error: { type: "x", code, message: "m" } });
    const adapter = createOpenAiAdapter({
      fetch: routed({ completions: () => streamResponse(body) }),
      model: "gpt-4o",
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind });
  });

  it("treats a stream that ends before [DONE] as an upstream failure", async () => {
    const adapter = createOpenAiAdapter({
      fetch: routed({ completions: () => streamResponse(delta("cut off")) }),
      model: "gpt-4o",
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("treats non-JSON event data as an upstream failure", async () => {
    const adapter = createOpenAiAdapter({
      fetch: routed({ completions: () => streamResponse("data: {not json\n\n") }),
      model: "gpt-4o",
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it.each(["length", "content_filter"])(
    "treats finish_reason %s as an upstream failure, not a complete reply",
    async (reason) => {
      const body = `${delta("partial")}${data({ choices: [{ index: 0, delta: {}, finish_reason: reason }] })}data: [DONE]

`;
      const adapter = createOpenAiAdapter({
        fetch: routed({ completions: () => streamResponse(body) }),
        model: "gpt-5",
      });
      await expect(
        drain(adapter.stream(request, KEY, new AbortController().signal)),
      ).rejects.toMatchObject({ kind: "upstream" });
    },
  );

  it("ignores chunks with no choices (usage or keep-alive frames)", async () => {
    const body = `${data({ choices: [] })}${delta("ok")}data: [DONE]\n\n`;
    const adapter = createOpenAiAdapter({
      fetch: routed({ completions: () => streamResponse(body) }),
      model: "gpt-4o",
    });
    expect(await drain(adapter.stream(request, KEY, new AbortController().signal))).toEqual([
      { type: "delta", text: "ok" },
      { type: "done" },
    ]);
  });

  it("maps a transport failure to the network kind, but rethrows an abort untouched", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const adapter = createOpenAiAdapter({ fetch: failing, model: "gpt-4o" });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "network" });

    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    const aborting = vi.fn(async () => {
      controller.abort();
      throw abortError;
    });
    const abortable = createOpenAiAdapter({ fetch: aborting, model: "gpt-4o" });
    await expect(drain(abortable.stream(request, KEY, controller.signal))).rejects.toBe(abortError);
  });
});

describe("openai adapter: reasoning effort", () => {
  it.each([
    ["o3-mini", true],
    ["o4-mini", true],
    ["gpt-5", true],
    ["gpt-5-mini", true],
    ["gpt-4o", false],
    ["gpt-4.1", false],
    ["gpt-5-chat-latest", false],
    ["chatgpt-4o-latest", false],
    ["o1-mini", false],
    ["o1-preview", false],
  ])("supportsReasoningEffort(%s) is %s", (id, expected) => {
    expect(supportsReasoningEffort(id)).toBe(expected);
  });

  it.each(["low", "medium", "high"] as const)(
    "sends reasoning_effort %s for a reasoning model",
    async (effort) => {
      const fetchMock = routed({ completions: () => streamResponse(HAPPY_STREAM) });
      const adapter = createOpenAiAdapter({ fetch: fetchMock, model: "gpt-5", effort });
      await drain(adapter.stream(request, KEY, new AbortController().signal));
      expect(sentBody(fetchMock).reasoning_effort).toBe(effort);
    },
  );

  it("leaves effort out for a model that does not support it", async () => {
    const fetchMock = routed({ completions: () => streamResponse(HAPPY_STREAM) });
    const adapter = createOpenAiAdapter({ fetch: fetchMock, model: "gpt-4o", effort: "high" });
    await drain(adapter.stream(request, KEY, new AbortController().signal));
    expect(sentBody(fetchMock)).not.toHaveProperty("reasoning_effort");
  });
});

describe("openai adapter: models", () => {
  it("keeps chat models only, newest first, and flags effort support", async () => {
    const fetchMock = routed({ models: () => json(MODELS_BODY) });
    const adapter = createOpenAiAdapter({ fetch: fetchMock });
    const models = await adapter.listModels(KEY, new AbortController().signal);
    expect(models).toEqual([
      { id: "gpt-5", displayName: "gpt-5", supportsEffort: true },
      { id: "o3-mini", displayName: "o3-mini", supportsEffort: true },
      { id: "gpt-4o", displayName: "gpt-4o", supportsEffort: false },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.openai.com/v1/models");
    expect((init?.headers as Record<string, string> | undefined)?.authorization).toBe(
      `Bearer ${KEY}`,
    );
  });

  it("caches per key until the TTL expires, and never per another key", async () => {
    let time = 1_000;
    const fetchMock = routed({ models: () => json(MODELS_BODY) });
    const adapter = createOpenAiAdapter({ fetch: fetchMock, now: () => time });
    const signal = new AbortController().signal;

    await adapter.listModels(KEY, signal);
    await adapter.listModels(KEY, signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await adapter.listModels("sk-other", signal);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    time += 11 * 60_000;
    await adapter.listModels(KEY, signal);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps at most 200 models and rejects an oversized body", async () => {
    const many = { data: Array.from({ length: 300 }, (_, i) => ({ id: `gpt-${i}`, created: i })) };
    const adapter = createOpenAiAdapter({ fetch: routed({ models: () => json(many) }) });
    expect(await adapter.listModels(KEY, new AbortController().signal)).toHaveLength(200);

    const huge = createOpenAiAdapter({
      fetch: routed({ models: () => json({ data: [], pad: "x".repeat(1_100_000) }) }),
    });
    await expect(huge.listModels(KEY, new AbortController().signal)).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("does not cache failures", async () => {
    const responses = [() => json({}, 500), () => json(MODELS_BODY)];
    const fetchMock = vi.fn(async () => (responses.shift() ?? (() => json(MODELS_BODY)))());
    const adapter = createOpenAiAdapter({ fetch: fetchMock });
    const signal = new AbortController().signal;
    await expect(adapter.listModels(KEY, signal)).rejects.toMatchObject({ kind: "upstream" });
    await expect(adapter.listModels(KEY, signal)).resolves.toHaveLength(3);
  });

  it("rejects a malformed models body", async () => {
    const adapter = createOpenAiAdapter({ fetch: routed({ models: () => json({ nope: true }) }) });
    await expect(adapter.listModels(KEY, new AbortController().signal)).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("fails cleanly when the account lists no chat models", async () => {
    const adapter = createOpenAiAdapter({
      fetch: routed({
        models: () => json({ data: [{ id: "whisper-1", created: 1 }] }),
        completions: () => streamResponse(""),
      }),
    });
    await expect(
      drain(adapter.stream(request, KEY, new AbortController().signal)),
    ).rejects.toMatchObject({ kind: "upstream" });
  });

  it("never stores the raw key in the cache", async () => {
    const adapter = createOpenAiAdapter({ fetch: routed({ models: () => json(MODELS_BODY) }) });
    await adapter.listModels(KEY, new AbortController().signal);
    expect(JSON.stringify(Object.values(adapter))).not.toContain(KEY);
  });
});
