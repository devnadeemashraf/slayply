import type { GenerateRequest } from "@slayply/core";
import { describe, expect, it, vi } from "vitest";
import { generateValidated, stripCodeFence } from "./generate.js";
import type { CompletionInput, GenerateChunk, ProviderAdapter } from "./types.js";

const request: GenerateRequest = {
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

const VALID_REPLY = JSON.stringify({
  outputs: [
    {
      id: "cover_letter",
      label: "Cover letter",
      text: "Hi",
      claims: [{ sentence: "Hi", factIds: ["F01"] }],
      charCount: 2,
    },
  ],
  warnings: [],
});

function scripted(replies: string[]) {
  const calls: CompletionInput[] = [];
  const streamCompletion = vi.fn((input: CompletionInput) => {
    calls.push(input);
    const reply = replies.shift() ?? "";
    return (async function* (): AsyncGenerator<GenerateChunk> {
      const half = Math.ceil(reply.length / 2);
      yield { type: "delta", text: reply.slice(0, half) };
      yield { type: "delta", text: reply.slice(half) };
      yield { type: "done" };
    })();
  });
  const adapter: ProviderAdapter = {
    id: "anthropic",
    stream: vi.fn(),
    streamCompletion,
    listModels: vi.fn(),
  };
  return { adapter, calls };
}

const signal = new AbortController().signal;

describe("generateValidated", () => {
  it("returns valid JSON on the first attempt and streams its deltas", async () => {
    const { adapter, calls } = scripted([VALID_REPLY]);
    const seen: string[] = [];
    const result = await generateValidated(adapter, request, "k", signal, (t) => seen.push(t));
    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(calls).toHaveLength(1);
    expect(seen.join("")).toBe(VALID_REPLY);
  });

  it("accepts a reply wrapped in a code fence", async () => {
    const { adapter } = scripted([`\`\`\`json\n${VALID_REPLY}\n\`\`\``]);
    expect(await generateValidated(adapter, request, "k", signal)).toMatchObject({
      ok: true,
      attempts: 1,
    });
  });

  it("repairs malformed JSON with one retry that carries the bad reply and the retry prompt", async () => {
    const { adapter, calls } = scripted(["{ not json", VALID_REPLY]);
    const result = await generateValidated(adapter, request, "k", signal);
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(calls).toHaveLength(2);

    const retry = calls[1];
    expect(retry?.system).toBe(calls[0]?.system);
    expect(retry?.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry?.messages[1]?.content).toBe("{ not json");
    expect(retry?.messages[2]?.content).toContain("failed schema validation");
  });

  it("repairs a reply that parses but breaks the schema", async () => {
    const { adapter } = scripted([JSON.stringify({ outputs: "nope" }), VALID_REPLY]);
    expect(await generateValidated(adapter, request, "k", signal)).toMatchObject({
      ok: true,
      attempts: 2,
    });
  });

  it("falls back to the raw text after repeated failure, with no third attempt", async () => {
    const { adapter, calls } = scripted(["first bad", "second bad", VALID_REPLY]);
    const result = await generateValidated(adapter, request, "k", signal);
    expect(result).toMatchObject({ ok: false, rawText: "second bad" });
    expect(result.ok === false && result.issues.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(2);
  });

  it("does not stream the retry attempt to onDelta", async () => {
    const { adapter } = scripted(["bad", VALID_REPLY]);
    const seen: string[] = [];
    await generateValidated(adapter, request, "k", signal, (t) => seen.push(t));
    expect(seen.join("")).toBe("bad");
  });

  it("propagates provider errors instead of retrying them", async () => {
    const adapter: ProviderAdapter = {
      id: "anthropic",
      stream: vi.fn(),
      streamCompletion: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("boom")) }),
      }),
      listModels: vi.fn(),
    };
    await expect(generateValidated(adapter, request, "k", signal)).rejects.toThrow("boom");
  });
});

describe("stripCodeFence", () => {
  it("unwraps one fence and leaves everything else alone", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
    expect(stripCodeFence('prose ```json\n{"a":1}\n``` more')).toBe(
      'prose ```json\n{"a":1}\n``` more',
    );
  });
});
