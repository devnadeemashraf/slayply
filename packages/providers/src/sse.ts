import { ProviderError } from "./types.js";

export type SseEvent = { event: string; data: string };

/** A single event larger than this means the upstream is misbehaving; stop buffering. */
const MAX_EVENT_CHARS = 1_000_000;
const EVENT_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;
const LINE_BREAK = /\r\n|\n|\r/;

function parseEvent(raw: string): SseEvent | undefined {
  let event = "message";
  const data: string[] = [];
  for (const line of raw.split(LINE_BREAK)) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length === 0 ? undefined : { event, data: data.join("\n") };
}

/** Incrementally parses a server-sent-events body. Works in Node and in the browser. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > MAX_EVENT_CHARS) throw new ProviderError("upstream");
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const match = EVENT_BOUNDARY.exec(buffer);
        if (match === null) break;
        const parsed = parseEvent(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (parsed !== undefined) yield parsed;
      }
      if (buffer.length > MAX_EVENT_CHARS) throw new ProviderError("upstream");
    }
    buffer += decoder.decode();
    const last = parseEvent(buffer);
    if (last !== undefined) yield last;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
