import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { GenerateChunk, ProviderAdapter } from "./provider.js";

const request = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

/** A model that thinks for `thinkMs` before its first token, like a reasoning model. */
function slow(thinkMs: number, fail = false): ProviderAdapter {
  const stream = (): AsyncIterable<GenerateChunk> =>
    (async function* () {
      await new Promise((resolve) => setTimeout(resolve, thinkMs));
      if (fail) throw new Error("boom");
      yield { type: "delta", text: "Hello" } as const;
      yield { type: "done" } as const;
    })();
  return { id: "anthropic", stream, streamCompletion: stream, listModels: async () => [] };
}

function post(adapter: ProviderAdapter, keepAliveMs?: number, streamDeadlineMs?: number) {
  const app = createApp({
    providers: { anthropic: adapter },
    extensionIds: [],
    trustedHops: 0,
    log: () => {},
    now: () => Date.now(),
    ...(keepAliveMs !== undefined ? { keepAliveMs } : {}),
    ...(streamDeadlineMs !== undefined ? { streamDeadlineMs } : {}),
  });
  return app.request("/v1/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-anthropic-key": "sk-ant-test-key-123" },
    body: JSON.stringify(request),
  });
}

describe("relay keep-alive", () => {
  it("sends ping events while the model is silent, before the first delta", async () => {
    const text = await (await post(slow(120), 20)).text();
    const firstPing = text.indexOf("event: ping");
    expect(firstPing).toBeGreaterThanOrEqual(0);
    expect(firstPing).toBeLessThan(text.indexOf("event: delta"));
    expect(text).toContain("event: done");
  });

  it("sends no ping for a stream that finishes inside the interval", async () => {
    const text = await (await post(slow(0), 5_000)).text();
    expect(text).not.toContain("event: ping");
    expect(text).toContain("event: done");
  });

  it("stops pinging once the stream fails, and still reports the error", async () => {
    const text = await (await post(slow(80, true), 20)).text();
    expect(text).toContain("event: error");
    expect(text.lastIndexOf("event: ping")).toBeLessThan(text.indexOf("event: error"));
  });

  it("carries no data a client could mistake for model text", async () => {
    const text = await (await post(slow(80), 20)).text();
    const pings = text.split("\n\n").filter((block) => block.startsWith("event: ping"));
    expect(pings.length).toBeGreaterThan(0);
    for (const block of pings) expect(block).toBe("event: ping\ndata: {}");
  });

  it("stops pinging when the deadline frees the stream, even if the model never answers", async () => {
    const hang: ProviderAdapter = slow(0);
    const never = (): AsyncIterable<GenerateChunk> =>
      (async function* () {
        await new Promise(() => {});
        yield { type: "done" } as const;
      })();
    const adapter = { ...hang, stream: never, streamCompletion: never };
    const response = await post(adapter, 10, 60);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    let seen = "";
    const decoder = new TextDecoder();
    const readFor = async (ms: number) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const next = await Promise.race([
          reader.read(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 30)),
        ]);
        if (next === null || next.done) return;
        seen += decoder.decode(next.value);
      }
    };
    await readFor(200);
    const pingsAtDeadline = seen.split("event: ping").length - 1;
    await readFor(200);
    expect(pingsAtDeadline).toBeGreaterThan(0);
    expect(seen.split("event: ping").length - 1).toBe(pingsAtDeadline);
    await reader.cancel();
  });
});
