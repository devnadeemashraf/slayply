/** Test helpers: build a stubbed relay reply without a network. */

const encoder = new TextEncoder();

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A relay stream that ends cleanly: one `delta` per piece, then `done`. */
export function relayStream(pieces: string[]): string {
  return `${pieces.map((text) => sseEvent("delta", { text })).join("")}${sseEvent("done", {})}`;
}

/** Streams `text` as a Response, cut into pieces of `size` characters so events split mid-line. */
export function sseResponse(text: string, size = text.length, init: ResponseInit = {}): Response {
  const bytes = encoder.encode(text);
  const step = Math.max(1, size);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += step) controller.enqueue(bytes.slice(i, i + step));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    ...init,
  });
}

export function relayErrorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message, details: [] } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A model reply that satisfies `validateGenerateResponse`. */
export function validReply(text: string): string {
  return JSON.stringify({
    outputs: [{ id: "q1", label: "Answer", text, claims: [], charCount: text.length }],
    warnings: ["No resume or profile was provided, so this answer is generic."],
  });
}

/** A model reply to a `fit_check` request that satisfies `validateGenerateResponse`. */
export function validFitReply(): string {
  return JSON.stringify({
    fit: {
      matches: [{ want: "Billing systems", have: "Built the billing system", factIds: ["F01"] }],
      gaps: ["No Rust experience"],
      chance: "medium",
      reason: "Strong backend match, one gap.",
      resume: { track: "sde", region: "us" },
      dealBreakers: [],
    },
    outputs: [],
    warnings: [],
  });
}
