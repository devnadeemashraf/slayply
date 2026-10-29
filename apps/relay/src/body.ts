export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "invalid_encoding" };

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Reads a request body as UTF-8 text, giving up as soon as more than `maxBytes` arrive.
 * Content-Length is never trusted: it can be absent (chunked) or wrong.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<BodyResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  if (request.body !== null) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, text: decoder.decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_encoding" };
  }
}
