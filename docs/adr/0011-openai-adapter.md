# ADR-0011: OpenAI Adapter (Chat Completions)

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `PROV-02`

---

## Context and Problem Statement
OpenAI offers two text endpoints: Chat Completions and the newer Responses API (recommended by OpenAI for new projects). The adapter must fit the `ProviderAdapter` shape from ADR-0004, stream text deltas, list models, and map reasoning effort (low, medium, high) to a provider parameter that is hidden when the model does not support it. `GET /v1/models` returns only `id`, `created` and `owned_by`, so it says nothing about capabilities.

---

## Considered Options
**Endpoint**
1. **Chat Completions (`POST /v1/chat/completions`).** One message list maps directly onto `CompletionInput`; the stream is plain `data:` frames ending in `[DONE]`; `reasoning_effort` is a documented top-level parameter. Other vendors and self-hosted gateways also speak it.
2. Responses API. Better for stateful or tool-heavy use, which we do not use; the effort parameter name (`reasoning.effort`) is unverified in `docs/VERSIONS.md`, and its stream has many typed events to handle.

**Effort and chat-model detection**
1. **Read both from the model id** (`o<digit>` and `gpt-5*` take effort; `*chat-latest`, `o1-mini` and `o1-preview` do not; chat models are `gpt-`, `chatgpt-`, `o<digit>` minus embedding, audio, image, `-pro` (Responses-only) and similar ids). The list is sorted by `created`, newest first.
2. Hard-code a model table (stale on release day, against SPEC §4 Feature 8).
3. Send effort to every model and retry on a 400 (costs a failed call and leaks intent for nothing).

---

## Decision Outcome
- **Endpoint:** option 1. Messages are `[{ role: "system", content: system }, ...messages]`; `max_completion_tokens` (not the older `max_tokens`, which reasoning models reject) is 16,000; no sampling parameters.
- **Stream:** only `choices[0].delta.content` strings are yielded; frames with no choices, an empty delta or a `refusal` are ignored; `data: [DONE]` ends the stream; a frame with an `error` object throws (`rate_limit_exceeded` and `insufficient_quota` are `rate_limit`, `invalid_api_key` is `auth`, anything else `upstream`); a body that ends without `[DONE]` throws. A `finish_reason` of `length` (the budget, often spent on hidden reasoning tokens) or `content_filter` throws `upstream` so a cut reply is never reported as complete. A `refusal` delta is not text and is ignored, so a refusal shows as an empty reply, which validation rejects.
- **Errors:** same `ProviderError` kinds as Claude. HTTP 503 is `overloaded`; upstream text is never copied.
- **Effort:** the adapter takes `effort` as an option and sends `reasoning_effort` only when `supportsReasoningEffort(model)` is true. `ModelInfo` gains an optional `supportsEffort`, set by the OpenAI adapter, so a UI can hide the control when it is not `true`. The Claude adapter does not set it yet (effort mapping for Claude is not built).
- **Models:** option 1 of the second question. The default model is the newest listed chat model. Same 10 minute cache keyed by a key fingerprint, 200-model cap and 1 MB body cap as Claude. Shared helpers moved to `util.ts`.

### Trade-offs
- The id heuristic can be wrong for a new family name (for example a reasoning model that does not start with `o<digit>` or `gpt-5`): its effort control stays hidden and its chat model may be missing from the list until the pattern is updated. This is the price of not hard-coding a table.
- `GenerateRequest` has no effort or model field, so the relay cannot yet pass them; the adapter option is the seam. Wiring them is a contract change for a later item.
- Chat Completions may receive fewer new features than Responses; switching later only touches this adapter.

---

## Validation & Verification
- Recorded-fixture tests: stream at several chunk sizes, headers and body shape, repair conversation order, newest-model default, HTTP and mid-stream error mapping with no leaked text, truncated stream, bad JSON, empty-choice frames, transport failure and abort, effort sent only for supporting models, model filtering and ordering, cache TTL and key isolation, 200-model and body caps, no raw key in the cache.
