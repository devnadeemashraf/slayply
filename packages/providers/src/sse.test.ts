import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSse, type SseEvent } from "./sse.js";
import { ProviderError } from "./types.js";

function bodyOf(...parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of readSse(body)) events.push(event);
  return events;
}

describe("readSse", () => {
  it("parses named events across arbitrary chunk splits", async () => {
    const events = await collect(bodyOf("eve", "nt: a\nda", "ta: 1\n", "\nevent: b\ndata: 2\n\n"));
    expect(events).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("handles CRLF line endings, comments and multi-line data", async () => {
    const events = await collect(
      bodyOf(": keep-alive\r\n\r\nevent: x\r\ndata: l1\r\ndata: l2\r\n\r\n"),
    );
    expect(events).toEqual([{ event: "x", data: "l1\nl2" }]);
  });

  it("defaults the event name and flushes a final event with no trailing blank line", async () => {
    expect(await collect(bodyOf("data: tail"))).toEqual([{ event: "message", data: "tail" }]);
  });

  it("keeps multi-byte characters intact when a chunk splits them", async () => {
    const bytes = new TextEncoder().encode("event: t\ndata: héllo 🙂\n\n");
    const cut = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    expect(await collect(body)).toEqual([{ event: "t", data: "héllo 🙂" }]);
  });

  it("refuses an unbounded event", async () => {
    const huge = `data: ${"x".repeat(1_100_000)}`;
    await expect(collect(bodyOf(huge))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("packages/providers source", () => {
  it("imports no Node built-ins, so it runs in the browser (Direct Mode)", () => {
    const dir = new URL(".", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(new URL(file, dir), "utf8");
      expect(source, file).not.toMatch(/from\s+["']node:/);
    }
  });
});
