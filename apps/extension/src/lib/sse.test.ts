import { describe, expect, it } from "vitest";
import { readSse } from "./sse.js";
import { sseResponse } from "./testing.js";

async function collect(text: string, size?: number) {
  const response = sseResponse(text, size);
  const events: { event: string; data: string }[] = [];
  for await (const item of readSse(response.body as ReadableStream<Uint8Array>)) events.push(item);
  return events;
}

const SAMPLE =
  'event: delta\ndata: {"text":"héllo ☕"}\n\nevent: delta\ndata: {"text":"two"}\n\nevent: done\ndata: {}\n\n';

describe("readSse", () => {
  it("parses events", async () => {
    expect(await collect(SAMPLE)).toEqual([
      { event: "delta", data: '{"text":"héllo ☕"}' },
      { event: "delta", data: '{"text":"two"}' },
      { event: "done", data: "{}" },
    ]);
  });

  it("gives the same events however the bytes are chunked, even inside a multi-byte character", async () => {
    const whole = await collect(SAMPLE);
    for (const size of [1, 2, 3, 5, 7, 11]) expect(await collect(SAMPLE, size)).toEqual(whole);
  });

  it("accepts CRLF line endings", async () => {
    expect(await collect("event: done\r\ndata: {}\r\n\r\n")).toEqual([
      { event: "done", data: "{}" },
    ]);
  });

  it("joins multiple data lines and ignores comments and unknown fields", async () => {
    expect(await collect(": keep-alive\nevent: delta\nid: 7\ndata: a\ndata: b\n\n")).toEqual([
      { event: "delta", data: "a\nb" },
    ]);
  });

  it("defaults the event name to message", async () => {
    expect(await collect("data: x\n\n")).toEqual([{ event: "message", data: "x" }]);
  });

  it("drops an event that never got its blank line", async () => {
    expect(await collect("event: delta\ndata: cut off")).toEqual([]);
  });

  it("returns nothing for an empty body", async () => {
    expect(await collect("")).toEqual([]);
  });

  it("aborts on an event larger than 1 MB instead of buffering it", async () => {
    const huge = `data: ${"x".repeat(1_100_000)}\n\n`;
    await expect(collect(huge, 65_536)).rejects.toThrow(/too large/);
  });
});
