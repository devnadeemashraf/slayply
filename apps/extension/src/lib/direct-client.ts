import { buildPrompt } from "@slayply/core";
import { createClaudeAdapter, ProviderError, type ProviderErrorKind } from "@slayply/providers";
import { isAbortError, RelayError, type StreamGenerateOptions } from "./relay-client.js";

/** Static, user-safe text per failure kind (the relay's wording); upstream text is never shown. */
const FAILURES: Record<ProviderErrorKind, { code: string; message: string }> = {
  auth: { code: "UPSTREAM_AUTH", message: "The provider rejected the API key" },
  rate_limit: { code: "UPSTREAM_RATE_LIMITED", message: "The provider is rate limiting this key" },
  overloaded: { code: "UPSTREAM_OVERLOADED", message: "The provider is overloaded" },
  invalid_request: { code: "UPSTREAM_REJECTED", message: "The provider rejected the request" },
  upstream: { code: "UPSTREAM_ERROR", message: "The provider request failed" },
  network: {
    code: "NETWORK",
    message:
      "Could not reach the provider. Check your connection and that Direct Mode still has permission for api.anthropic.com.",
  },
};

/**
 * Direct Mode (a redirect is refused: the browser would forward the `x-api-key` header across origins) (SPEC Feature 8): the same Claude adapter the relay uses, called from the side panel
 * with the user's own key. It takes the relay's options so callers can swap it in, but ignores
 * `baseUrl`: the adapter's default base URL is the only place the key can go.
 */
export async function* streamDirect(options: StreamGenerateOptions): AsyncGenerator<string> {
  const adapter = createClaudeAdapter({
    fetch: (input, init) => options.fetchFn(String(input), { ...init, redirect: "error" }),
    browserAccess: true,
  });
  let finished = false;
  try {
    for await (const chunk of adapter.streamCompletion(
      buildPrompt(options.request),
      options.apiKey,
      options.signal,
    )) {
      if (chunk.type === "done") finished = true;
      else yield chunk.text;
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    const failure = FAILURES[error instanceof ProviderError ? error.kind : "upstream"];
    throw new RelayError(failure.code, failure.message);
  }
  if (!finished) throw new RelayError(FAILURES.upstream.code, FAILURES.upstream.message);
}
