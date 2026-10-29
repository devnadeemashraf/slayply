/** One Server-Sent Event: the `event:` name (default `message`) and its joined `data:` lines. */
export type SseEvent = { event: string; data: string };

/** A single event larger than this aborts the read instead of growing the buffer without bound. */
const MAX_EVENT_CHARS = 1_000_000;

const EVENT_BOUNDARY = /\r?\n\r?\n/;
const LINE_BREAK = /\r?\n/;

function parseEvent(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(LINE_BREAK)) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length === 0 ? null : { event, data: data.join("\n") };
}

/** Incremental SSE parser. Safe against any chunking of the bytes, including inside a character. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const boundary = EVENT_BOUNDARY.exec(buffer);
        if (!boundary) break;
        const event = parseEvent(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
        if (event) yield event;
      }
      if (buffer.length > MAX_EVENT_CHARS) throw new Error("SSE event too large");
    }
  } finally {
    reader.releaseLock();
  }
}
