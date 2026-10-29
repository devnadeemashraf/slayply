import { describe, expect, it, vi } from "vitest";
import { streamDirect } from "./direct-client.js";
import { RelayError } from "./relay-client.js";

const KEY = "sk-ant-secret-key";
const REQUEST = {
  task: "answers",
  job: { jd: "Build things" },
  resume: { track: "backend", region: "us", text: "" },
  profile: { facts: [], stories: [], prefs: {} },
  questions: [{ id: "q1", text: "Why us?", maxChars: 500 }],
  style: { tone: "crisp", length: "medium" },
} as never;

function sse(events: Array<[string, unknown]>): string {
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function delta(text: string): [string, unknown] {
  return [
    "content_block_delta",
    { type: "content_block_delta", delta: { type: "text_delta", text } },
  ];
}

function streamBody(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function route(handlers: { messages: () => Response }) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes("/v1/models")) {
      return Response.json({ data: [{ id: "claude-test", display_name: "Test" }] });
    }
    return handlers.messages();
  });
}

function run(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
) {
  return streamDirect({
    baseUrl: "https://relay.example",
    apiKey: KEY,
    request: REQUEST,
    fetchFn,
    signal: signal ?? new AbortController().signal,
  });
}

async function drain(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const piece of iterable) out.push(piece);
  return out;
}

describe("streamDirect", () => {
  it("yields each text delta from the provider", async () => {
    const fetchFn = route({
      messages: () =>
        streamBody(sse([delta("Hel"), delta("lo"), ["message_stop", { type: "message_stop" }]])),
    });
    expect(await drain(run(fetchFn))).toEqual(["Hel", "lo"]);
  });

  it("sends the key only to api.anthropic.com, never to the relay, and with the browser opt-in header", async () => {
    const fetchFn = route({
      messages: () => streamBody(sse([delta("x"), ["message_stop", { type: "message_stop" }]])),
    });
    await drain(run(fetchFn));

    expect(fetchFn.mock.calls.length).toBeGreaterThan(0);
    for (const [url, init] of fetchFn.mock.calls) {
      expect(new URL(url).origin).toBe("https://api.anthropic.com");
      expect(url).not.toContain(KEY);
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe(KEY);
      expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    }
    expect(fetchFn.mock.calls.some(([url]) => url.includes("relay.example"))).toBe(false);
  });

  it.each([
    [401, "UPSTREAM_AUTH"],
    [429, "UPSTREAM_RATE_LIMITED"],
    [529, "UPSTREAM_OVERLOADED"],
    [400, "UPSTREAM_REJECTED"],
    [500, "UPSTREAM_ERROR"],
  ])(
    "turns HTTP %i into a RelayError %s with static text that never holds the key",
    async (status, code) => {
      const fetchFn = route({
        messages: () => Response.json({ error: { message: `bad key ${KEY}` } }, { status }),
      });
      const error = await drain(run(fetchFn)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RelayError);
      expect((error as RelayError).code).toBe(code);
      expect((error as RelayError).message).not.toContain(KEY);
    },
  );

  it("refuses redirects so the key cannot follow one to another origin", async () => {
    const fetchFn = route({
      messages: () => streamBody(sse([delta("x"), ["message_stop", { type: "message_stop" }]])),
    });
    await drain(run(fetchFn));
    expect(fetchFn.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of fetchFn.mock.calls) expect(init?.redirect).toBe("error");
  });

  it("reports a network failure as NETWORK", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const error = await drain(run(fetchFn)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "NETWORK" });
  });

  it("reports a stream that ends early as an error, not a finished answer", async () => {
    const fetchFn = route({ messages: () => streamBody(sse([delta("cut")])) });
    const error = await drain(run(fetchFn)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RelayError);
    expect((error as RelayError).code).toBe("UPSTREAM_ERROR");
  });

  it("rethrows an abort unchanged", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("aborted", "AbortError");
    const fetchFn = vi.fn(async () => {
      controller.abort();
      throw abortError;
    });
    await expect(drain(run(fetchFn, controller.signal))).rejects.toBe(abortError);
  });
});
