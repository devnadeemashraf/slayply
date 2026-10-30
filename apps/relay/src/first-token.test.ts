import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { GenerateChunk, ProviderAdapter } from "./provider.js";

// SPEC §5: first token in under 1.5 s when the relay is awake. The provider here answers at once,
// so this measures the relay's own overhead (validation, limiter, SSE framing), not a vendor.
const FIRST_TOKEN_BUDGET_MS = 1500;

const request = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

function stubbed(): ProviderAdapter {
  const stream = (): AsyncIterable<GenerateChunk> =>
    (async function* () {
      yield { type: "delta", text: "Hello" } as const;
      yield { type: "delta", text: " world" } as const;
      yield { type: "done" } as const;
    })();
  return { id: "anthropic", stream, streamCompletion: stream, listModels: async () => [] };
}

describe("relay first-token latency", () => {
  it("sends the first delta within the budget against a stubbed provider", async () => {
    const app = createApp({
      providers: { anthropic: stubbed() },
      extensionIds: [],
      trustedHops: 0,
      log: () => {},
      now: () => Date.now(),
    });

    const start = performance.now();
    const response = await app.request("/v1/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-anthropic-key": "sk-ant-test-key-123",
      },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(200);

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    const elapsed = performance.now() - start;
    await reader.cancel();

    expect(new TextDecoder().decode(first.value)).toContain("event: delta");
    console.log(`relay first delta: ${elapsed.toFixed(1)} ms (budget ${FIRST_TOKEN_BUDGET_MS} ms)`);
    expect(elapsed).toBeLessThan(FIRST_TOKEN_BUDGET_MS);
  });
});
