import { describe, expect, it, vi } from "vitest";
import { buildAnswerRequest, buildFitRequest } from "./build-request.js";
import {
  copyTextOf,
  createGenerationRunner,
  type GenerationState,
  MAX_REPLY_CHARS,
  runGeneration,
} from "./generate-controller.js";
import {
  relayErrorResponse,
  relayStream,
  sseEvent,
  sseResponse,
  validFitReply,
  validReply,
} from "./testing.js";

const built = buildAnswerRequest({ jd: "Build things", question: "Why you?" });
if (!built.ok) throw new Error("fixture request must be valid");
const REQUEST = built.request;

function setup(replies: Array<() => Response | Promise<Response>>) {
  const fetchFn = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error("unexpected extra request");
    return next();
  });
  const states: GenerationState[] = [];
  const controller = new AbortController();
  const done = () =>
    runGeneration({
      baseUrl: "http://relay.test",
      apiKey: "sk-ant-secret",
      request: REQUEST,
      fetchFn,
      signal: controller.signal,
      onState: (state) => states.push(state),
    });
  return { fetchFn, states, controller, done };
}

/** Splits a model reply into `count` roughly equal pieces, like a token stream. */
function pieces(reply: string, count = 6): string[] {
  const size = Math.ceil(reply.length / count);
  return Array.from({ length: count }, (_, i) => reply.slice(i * size, (i + 1) * size)).filter(
    Boolean,
  );
}

describe("runGeneration (against a stubbed relay)", () => {
  it("streams a live preview, then ends with the validated answer", async () => {
    const reply = validReply("I build reliable systems.");
    const { states, done, fetchFn } = setup([() => sseResponse(relayStream(pieces(reply)), 9)]);
    await done();

    const previews = states.flatMap((s) => (s.phase === "streaming" ? [s.preview] : []));
    expect(previews.at(-1)).toBe("I build reliable systems.");
    expect(previews.some((p) => p !== "" && p.length < "I build reliable systems.".length)).toBe(
      true,
    );

    const last = states.at(-1);
    expect(last?.phase).toBe("done");
    if (last?.phase !== "done") return;
    expect(last.attempts).toBe(1);
    expect(last.response.outputs[0]?.text).toBe("I build reliable systems.");
    expect(copyTextOf(last)).toBe("I build reliable systems.");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("unwraps a code fence around the JSON", async () => {
    const reply = `\`\`\`json\n${validReply("Fenced.")}\n\`\`\``;
    const { states, done } = setup([() => sseResponse(relayStream(pieces(reply)))]);
    await done();
    expect(states.at(-1)?.phase).toBe("done");
  });

  it("re-requests once when the reply is not valid, clearing the preview and saying so", async () => {
    const { states, done, fetchFn } = setup([
      () => sseResponse(relayStream(["Sorry, here is prose, not JSON."])),
      () => sseResponse(relayStream(pieces(validReply("Second try works.")))),
    ]);
    await done();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const attemptTwo = states.find((s) => s.phase === "streaming" && s.attempt === 2);
    expect(attemptTwo).toMatchObject({ phase: "streaming", attempt: 2, preview: "" });
    const last = states.at(-1);
    expect(last).toMatchObject({ phase: "done", attempts: 2 });
  });

  it("falls back to the raw text after two invalid replies, and never loops", async () => {
    const { states, done, fetchFn } = setup([
      () => sseResponse(relayStream(["first {bad"])),
      () => sseResponse(relayStream(["second {still bad"])),
      () => sseResponse(relayStream(["never requested"])),
    ]);
    await done();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const last = states.at(-1);
    expect(last).toMatchObject({ phase: "raw", rawText: "second {still bad" });
    expect(copyTextOf(last as GenerationState)).toBe("second {still bad");
  });

  it("treats a reply that parses but breaks the schema as invalid", async () => {
    const { states, done } = setup([
      () => sseResponse(relayStream([JSON.stringify({ outputs: "nope", warnings: [] })])),
      () => sseResponse(relayStream(pieces(validReply("Fixed.")))),
    ]);
    await done();
    expect(states.at(-1)).toMatchObject({ phase: "done", attempts: 2 });
  });

  it("does not retry on a relay error event; it shows the relay's message", async () => {
    const text =
      sseEvent("delta", { text: '{"outputs":[{"text":"par' }) +
      sseEvent("error", { code: "UPSTREAM_AUTH", message: "The provider rejected the API key" });
    const { states, done, fetchFn } = setup([() => sseResponse(text)]);
    await done();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({
      phase: "error",
      message: "The provider rejected the API key",
      code: "UPSTREAM_AUTH",
    });
  });

  it("does not retry on an HTTP error", async () => {
    const { states, done, fetchFn } = setup([
      () => relayErrorResponse(429, "RATE_LIMITED", "Too many requests"),
    ]);
    await done();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ phase: "error", code: "RATE_LIMITED" });
  });

  it("shows a network failure as an error and never includes the key", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const states: GenerationState[] = [];
    await runGeneration({
      baseUrl: "http://relay.test",
      apiKey: "sk-ant-secret",
      request: REQUEST,
      fetchFn,
      signal: new AbortController().signal,
      onState: (s) => states.push(s),
    });
    const last = states.at(-1);
    expect(last).toMatchObject({ phase: "error", code: "NETWORK" });
    expect(JSON.stringify(states)).not.toContain("sk-ant-secret");
  });

  it("returns to idle when the user cancels mid-stream, with no error and no retry", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(sseEvent("delta", { text: '{"outputs":[{"text":"hal' })),
          );
          init?.signal?.addEventListener("abort", () =>
            c.error(new DOMException("aborted", "AbortError")),
          );
        },
      });
      return new Response(body, { status: 200 });
    });
    const states: GenerationState[] = [];
    const run = runGeneration({
      baseUrl: "http://relay.test",
      apiKey: "k",
      request: REQUEST,
      fetchFn,
      signal: controller.signal,
      onState: (s) => states.push(s),
    });
    await vi.waitFor(() => expect(states.some((s) => s.phase === "streaming")).toBe(true));
    controller.abort();
    await run;
    expect(states.at(-1)).toEqual({ phase: "idle" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stops with an error when the reply grows past the size cap, and does not retry", async () => {
    const huge = "x".repeat(MAX_REPLY_CHARS + 1);
    const { states, done, fetchFn } = setup([() => sseResponse(relayStream([huge]))]);
    await done();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ phase: "error", code: "TOO_LARGE" });
  });

  it("ignores a cancelled run's late state once a newer run has started", async () => {
    const states: GenerationState[] = [];
    let release: (() => void) | undefined;
    const slowFetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          release = () => reject(new DOMException("aborted", "AbortError"));
          init?.signal?.addEventListener("abort", () => release?.());
        }),
    );
    const fastReply = sseResponse(relayStream(pieces(validReply("Newest."))));
    const fetches = [slowFetch, vi.fn(async () => fastReply)];
    const runner = createGenerationRunner((s) => states.push(s));
    const base = {
      baseUrl: "http://relay.test",
      apiKey: "k",
      request: REQUEST,
      fetchFn: (url: string, init?: RequestInit) => {
        const next = fetches.shift();
        if (!next) throw new Error("unexpected request");
        return next(url, init);
      },
    };

    const first = runner.start(base);
    await vi.waitFor(() => expect(slowFetch).toHaveBeenCalled());
    const second = runner.start(base);
    await Promise.all([first, second]);

    expect(states.at(-1)).toMatchObject({ phase: "done" });
    expect(states.filter((s) => s.phase === "idle")).toHaveLength(0);
  });

  it("stop() cancels the current run and ends in idle", async () => {
    const states: GenerationState[] = [];
    const hanging = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    const runner = createGenerationRunner((s) => states.push(s));
    const run = runner.start({
      baseUrl: "http://relay.test",
      apiKey: "k",
      request: REQUEST,
      fetchFn: hanging,
    });
    await vi.waitFor(() => expect(states.some((s) => s.phase === "streaming")).toBe(true));
    runner.stop();
    await run;
    expect(states.at(-1)).toEqual({ phase: "idle" });
  });

  it("carries the facts that were sent, so claims are checked against them", async () => {
    const states: GenerationState[] = [];
    await runGeneration({
      baseUrl: "http://relay.test",
      apiKey: "sk-ant-secret",
      request: {
        ...REQUEST,
        profile: { facts: [{ id: "F01", text: "Built a thing." }], stories: [], prefs: {} },
      },
      fetchFn: vi.fn(async () => sseResponse(relayStream([validReply("I built a thing.")]))),
      signal: new AbortController().signal,
      onState: (state) => states.push(state),
    });
    const last = states.at(-1);
    if (last?.phase !== "done") throw new Error("expected done");
    expect(last.profile.facts).toEqual([{ id: "F01", text: "Built a thing." }]);
  });

  it("copies the edited text of an output instead of the original", () => {
    const state: GenerationState = {
      phase: "done",
      attempts: 1,
      profile: { facts: [], stories: [] },
      response: {
        outputs: [
          { id: "a", label: "A", text: "One. Two.", claims: [], charCount: 9 },
          { id: "b", label: "B", text: "Three.", claims: [], charCount: 6 },
        ],
        warnings: [],
      },
    };
    expect(copyTextOf(state, { a: "One." })).toBe("One.\n\nThree.");
    expect(copyTextOf(state, {})).toBe("One. Two.\n\nThree.");
  });

  it("cannot copy before an answer is validated", () => {
    expect(copyTextOf({ phase: "idle" })).toBeNull();
    expect(copyTextOf({ phase: "streaming", attempt: 1, preview: "partial" })).toBeNull();
    expect(copyTextOf({ phase: "error", message: "x", code: "NETWORK" })).toBeNull();
  });
});

describe("runGeneration for a fit check", () => {
  const fitBuilt = buildFitRequest({ jd: "Build billing systems" });
  if (!fitBuilt.ok) throw new Error("fixture request must be valid");
  const fitRequest = fitBuilt.request;

  function run(replies: Array<() => Response>) {
    const states: GenerationState[] = [];
    const fetchFn = vi.fn(async () => {
      const next = replies.shift();
      if (!next) throw new Error("unexpected extra request");
      return next();
    });
    const done = runGeneration({
      baseUrl: "http://relay.test",
      apiKey: "sk-ant-secret",
      request: fitRequest,
      fetchFn,
      signal: new AbortController().signal,
      onState: (state) => states.push(state),
    });
    return { states, fetchFn, done };
  }

  it("ends with the validated fit result", async () => {
    const { states, done } = run([() => sseResponse(relayStream([validFitReply()]))]);
    await done;
    const last = states.at(-1);
    expect(last?.phase).toBe("done");
    if (last?.phase === "done") expect(last.response.fit?.chance).toBe("medium");
  });

  it("treats a reply without a fit object as invalid and asks once more", async () => {
    const { states, done, fetchFn } = run([
      () => sseResponse(relayStream([validReply("Just text.")])),
      () => sseResponse(relayStream([validFitReply()])),
    ]);
    await done;
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.phase).toBe("done");
  });

  it("ends as raw text when both replies lack a fit object", async () => {
    const { states, done } = run([
      () => sseResponse(relayStream([validReply("No fit.")])),
      () => sseResponse(relayStream([validReply("Still none.")])),
    ]);
    await done;
    const last = states.at(-1);
    expect(last?.phase).toBe("raw");
    if (last?.phase === "raw") expect(last.issues[0]?.path).toBe("fit");
  });
});

describe("runGeneration in Direct Mode", () => {
  it("calls the provider, never the relay, and still validates the reply", async () => {
    const reply = validReply("Straight from the provider.");
    const body = [
      ...pieces(reply).map(
        (text) =>
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text } })}\n\n`,
      ),
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join("");
    const urls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("/v1/models")) return Response.json({ data: [{ id: "claude-test" }] });
      return new Response(body, { status: 200 });
    });
    const states: GenerationState[] = [];
    await runGeneration({
      baseUrl: "http://relay.test",
      apiKey: "sk-ant-secret",
      request: REQUEST,
      fetchFn,
      direct: true,
      signal: new AbortController().signal,
      onState: (state) => states.push(state),
    });

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.startsWith("https://api.anthropic.com/"))).toBe(true);
    expect(urls.some((u) => u.includes("relay.test"))).toBe(false);
    const last = states.at(-1);
    expect(last?.phase).toBe("done");
  });
});
