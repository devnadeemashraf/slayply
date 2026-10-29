import { describe, expect, it } from "vitest";
import { readBodyText } from "./body.js";

function chunked(chunks: Uint8Array[]): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Request("http://relay.test/", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as RequestInit);
}

describe("readBodyText", () => {
  it("returns the decoded text of a small body", async () => {
    const request = new Request("http://relay.test/", { method: "POST", body: '{"a":"é"}' });
    expect(await readBodyText(request, 100)).toEqual({ ok: true, text: '{"a":"é"}' });
  });

  it("accepts a body of exactly maxBytes", async () => {
    const request = new Request("http://relay.test/", { method: "POST", body: "x".repeat(10) });
    expect(await readBodyText(request, 10)).toEqual({ ok: true, text: "x".repeat(10) });
  });

  it("rejects a body one byte over maxBytes", async () => {
    const request = new Request("http://relay.test/", { method: "POST", body: "x".repeat(11) });
    expect(await readBodyText(request, 10)).toEqual({ ok: false, reason: "too_large" });
  });

  it("stops reading a chunked body once the cap is crossed", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1_000));
        if (pulled > 10_000) controller.close();
      },
    });
    const request = new Request("http://relay.test/", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readBodyText(request, 5_000)).toEqual({ ok: false, reason: "too_large" });
    expect(pulled).toBeLessThan(100);
  });

  it("counts bytes, not characters", async () => {
    const request = new Request("http://relay.test/", { method: "POST", body: "é".repeat(6) });
    expect(await readBodyText(request, 10)).toEqual({ ok: false, reason: "too_large" });
  });

  it("decodes a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode("é");
    const result = await readBodyText(chunked([bytes.slice(0, 1), bytes.slice(1)]), 10);
    expect(result).toEqual({ ok: true, text: "é" });
  });

  it("rejects invalid UTF-8", async () => {
    const request = new Request("http://relay.test/", {
      method: "POST",
      body: new Uint8Array([0xff, 0xfe, 0x00, 0x80]),
    });
    expect(await readBodyText(request, 100)).toEqual({ ok: false, reason: "invalid_encoding" });
  });

  it("treats a missing body as empty text", async () => {
    const request = new Request("http://relay.test/", { method: "POST" });
    expect(await readBodyText(request, 100)).toEqual({ ok: true, text: "" });
  });
});
