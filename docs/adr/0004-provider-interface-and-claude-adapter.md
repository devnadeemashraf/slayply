# ADR-0004: Provider Interface and Claude Adapter

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `PROV-01`

---

## Context and Problem Statement
`packages/providers` is the one place that talks to an LLM vendor. The relay (Node) and Direct Mode (browser, `DIRECT-01`) must both use it, and `PROV-02` / `PROV-03` add OpenAI and Gemini behind the same shape. Four choices are costly to change later:

1. Where the `ProviderAdapter` interface lives and what it exposes.
2. How the one-shot JSON repair (SPEC §6) fits next to streaming.
3. Which Anthropic API version and request shape to pin.
4. How the model list is cached without keeping a usable API key.

---

## Decision Drivers
- Same code in Node and the browser: no `node:` imports, only web-standard `fetch`, `ReadableStream`, `TextDecoder`, `crypto.subtle`.
- User keys must never be stored, logged or echoed (SPEC §5).
- Tests run on recorded fixtures with no network.
- The relay must stay a thin, stateless pipe.

---

## Considered Options
**Interface location**
1. **`ProviderAdapter`, `ProviderError` and `GenerateChunk` in `packages/providers`; the relay imports them.**
2. Keep the interface in `apps/relay` and let providers depend on the relay (wrong direction).
3. Put it in `packages/core` (core is compiled without DOM or Node types; adapters need `AbortSignal` and `fetch`).

**Repair retry**
1. **Adapters expose `streamCompletion(input)` over a full conversation; `generateValidated` in providers builds the prompt, validates, and sends one repair turn (bad reply + `retryPrompt`).**
2. Relay validates and retries server-side (buffers the whole reply, defeats first-token latency, and makes the relay stateful per request).
3. Client-only retry with no shared helper (every consumer re-implements it).

**Anthropic version and request**
1. **`anthropic-version: 2023-06-01`, streaming `POST /v1/messages`, no sampling parameters.**
2. `2026-10-21`, the newest version.

**Model cache**
1. **Per adapter instance, keyed by a SHA-256 fingerprint of the key, 10 minute TTL, 100 entries.**
2. One global list (leaks account-specific models between users on a shared relay).
3. Key the cache on the raw key (retains a usable secret).

---

## Decision Outcome
- **Interface:** option 1. `ProviderAdapter` has `stream(request, key, signal)` (builds the SPEC §7 prompt with `buildPrompt`), `streamCompletion(input, key, signal)` and `listModels(key, signal)`. Chunks stay provider-neutral (`delta`, `done`). The relay re-exports the types from `provider.ts`.
- **Repair:** option 1. The relay still streams raw text and does not retry; a client that wants validation calls `generateValidated` (Direct Mode) or validates the streamed text itself (`GEN-01`). `generateValidated` strips one code fence, validates with `validateGenerateResponse`, retries once with `retryPrompt`, then returns `{ ok: false, rawText }` so the UI can show the raw text. The retry is not streamed.
- **Version:** option 1. `2023-06-01` remains valid per the version history. `2026-10-21` only removes `temperature`, `top_p` and `top_k` and tightens two 400 cases, none of which we send, so there is nothing to gain and one more thing to re-verify. Revisit when a feature needs a newer behaviour. No thinking or effort parameter is sent: the models default to adaptive thinking, and effort mapping belongs to a later item.
- **Streaming parse:** only `content_block_delta` with a `text_delta` is yielded; `thinking_delta` and `ping` are ignored; `message_stop` ends the stream; an `error` event or a body that ends without `message_stop` throws. A single SSE event over 1 MB aborts.
- **Errors:** `ProviderError` carries a kind (`auth`, `rate_limit`, `overloaded`, `invalid_request`, `upstream`, `network`) mapped from the HTTP status or error event type. Its message is ours; upstream text is never copied, because it can echo request details. An abort is rethrown unchanged.
- **Model selection:** `GenerateRequest` has no model field, so the adapter uses `options.model` or else the newest model returned by `GET /v1/models`. Letting the user choose is a contract change for a later item.
- **Model cache:** option 1. The key is hashed with SHA-256 before use, so the cache holds no usable secret and one user's list is never served to another.
- **Browser access:** the `anthropic-dangerous-direct-browser-access: true` header is sent only when `browserAccess` is set. Anthropic's current docs do not mention it; whether it is required for extension origins is still unverified (`docs/VERSIONS.md`) and must be tested in `DIRECT-01`.
- **Relay guards deferred by ADR-0003, now built:** a total stream deadline (120 s, then `STREAM_TIMEOUT`), a cap of 2 open streams per client IP (`429 TOO_MANY_STREAMS`) and a 15 s body-read timeout (`408 REQUEST_TIMEOUT`). Provider failures reach the client as a static code per kind (`UPSTREAM_AUTH`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_OVERLOADED`, `UPSTREAM_REJECTED`, `UPSTREAM_ERROR`). `GET /v1/models?provider=` maps failures to 401, 429, 503 or 502. Keying IPv6 clients on their /64 is still open.

### Trade-offs
- Mid-stream failures still arrive as an SSE `error` event with HTTP 200, so a wrong key surfaces after the stream opens rather than as a 401.
- The deadline and the stream cap are per process and reset on restart, like the rate limiter.
- Two near-identical entry points (`stream`, `streamCompletion`) exist so the relay needs no knowledge of prompts or the retry turn.

---

## Validation & Verification
- Recorded-fixture tests drive the adapter with `fetch` injected: happy stream at several chunk sizes, thinking deltas skipped, headers and body shape (no sampling parameters), status and event error mapping, truncated stream, malformed event data, abort passthrough, model list parsing, cache TTL and per-key isolation, failures not cached, the raw key absent from the cache.
- `generateValidated` tests: first-try success, fenced JSON, malformed then repaired, schema failure then repaired, repeated failure falls back to raw text with exactly two calls, retry not streamed, provider errors propagate.
- A source test asserts `packages/providers/src` imports no `node:` module.
- Mutation spot-check: removing the stream cap, the deadline, or the truncated-stream check each makes a test fail.
