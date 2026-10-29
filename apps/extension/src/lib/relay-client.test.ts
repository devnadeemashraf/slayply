import { describe, expect, it, vi } from "vitest";
import { RelayError, streamGenerate } from "./relay-client.js";
import { relayErrorResponse, relayStream, sseEvent, sseResponse } from "./testing.js";

const REQUEST = { task: "answers" } as never;

function run(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
) {
  return streamGenerate({
    baseUrl: "http://relay.test/",
    apiKey: "sk-ant-secret",
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

describe("streamGenerate", () => {
  it("posts JSON with the key header only and yields each delta", async () => {
    const fetchFn = vi.fn(async () => sseResponse(relayStream(["Hel", "lo"]), 4));
    expect(await drain(run(fetchFn))).toEqual(["Hel", "lo"]);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://relay.test/v1/generate");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-User-Anthropic-Key": "sk-ant-secret",
    });
    expect(init.body).toBe(JSON.stringify(REQUEST));
    expect(String(url)).not.toContain("sk-ant-secret");
  });

  it("turns a relay JSON error into a RelayError with the relay's code and message", async () => {
    const fetchFn = async () => relayErrorResponse(429, "RATE_LIMITED", "Too many requests");
    const error = await drain(run(fetchFn)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RelayError);
    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many requests",
      status: 429,
    });
  });

  it("gives a generic error when a non-2xx body is not the relay's JSON", async () => {
    const fetchFn = async () => new Response("<html>bad gateway</html>", { status: 502 });
    const error = await drain(run(fetchFn)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "HTTP_502", status: 502 });
    expect((error as Error).message).not.toContain("<html>");
  });

  it("turns an in-stream error event into a RelayError and keeps the deltas before it", async () => {
    const text =
      sseEvent("delta", { text: "part" }) +
      sseEvent("error", { code: "UPSTREAM_AUTH", message: "The provider rejected the API key" });
    const seen: string[] = [];
    let error: unknown;
    try {
      for await (const piece of run(async () => sseResponse(text))) seen.push(piece);
    } catch (e) {
      error = e;
    }
    expect(seen).toEqual(["part"]);
    expect(error).toMatchObject({ code: "UPSTREAM_AUTH" });
  });

  it("fails when the stream ends without a done event", async () => {
    const fetchFn = async () => sseResponse(sseEvent("delta", { text: "cut" }));
    const error = await drain(run(fetchFn)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "STREAM_INCOMPLETE" });
  });

  it("reports a network failure without echoing the underlying message", async () => {
    const fetchFn = async () => {
      throw new TypeError("Failed to fetch https://relay.test with sk-ant-secret");
    };
    const error = await drain(run(fetchFn)).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "NETWORK" });
    expect((error as Error).message).not.toContain("sk-ant-secret");
  });

  it("ignores a malformed delta payload instead of crashing the stream", async () => {
    const text = `event: delta\ndata: not json\n\n${sseEvent("delta", { text: "ok" })}${sseEvent("done", {})}`;
    expect(await drain(run(async () => sseResponse(text)))).toEqual(["ok"]);
  });

  it("ignores a delta whose text is not a string", async () => {
    const text = `${sseEvent("delta", { text: 42 })}${sseEvent("done", {})}`;
    expect(await drain(run(async () => sseResponse(text)))).toEqual([]);
  });

  it("rethrows an abort unchanged so the caller can tell it from a failure", async () => {
    const controller = new AbortController();
    const fetchFn = async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    };
    const error = await drain(run(fetchFn, controller.signal)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("AbortError");
  });

  it("stops yielding once done arrives", async () => {
    const text = `${relayStream(["a"])}${sseEvent("delta", { text: "after" })}`;
    expect(await drain(run(async () => sseResponse(text)))).toEqual(["a"]);
  });
});
