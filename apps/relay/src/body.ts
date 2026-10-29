export type BodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "invalid_encoding" | "timeout" };

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Reads a request body as UTF-8 text, giving up as soon as more than `maxBytes` arrive.
 * Content-Length is never trusted: it can be absent (chunked) or wrong. A body that has not
 * fully arrived after `timeoutMs` is abandoned, so a slow-drip upload cannot hold a connection.
 */
export async function readBodyText(
  request: Request,
  maxBytes: number,
  timeoutMs = 15_000,
): Promise<BodyResult> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  if (request.body !== null) {
    const reader = request.body.getReader();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reader.cancel().catch(() => undefined);
    }, timeoutMs);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (timedOut) return { ok: false, reason: "timeout" };
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          return { ok: false, reason: "too_large" };
        }
        chunks.push(value);
      }
    } catch (error) {
      if (timedOut) return { ok: false, reason: "timeout" };
      throw error;
    } finally {
      clearTimeout(timer);
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
