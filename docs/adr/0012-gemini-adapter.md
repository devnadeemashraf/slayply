# ADR-0012: Gemini Adapter

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `PROV-03`

---

## Context and Problem Statement
The third adapter must fit the `ProviderAdapter` shape (ADR-0004, ADR-0011), stream text, list models and map effort to Gemini's thinking settings. Gemini differs from the other two: the key can go in the URL or a header, a bad key is HTTP 400, the stream has no end marker, thinking is a token budget on 2.5 models and a level on 3, and the model list has no date field.

---

## Decision Outcome
- **Key:** sent in the `x-goog-api-key` header, never `?key=`, so it cannot reach a URL log.
- **Endpoint:** `POST /v1beta/models/{model}:streamGenerateContent?alt=sse` with `systemInstruction`, `contents` (`assistant` becomes `model`) and `generationConfig.maxOutputTokens` 16,000.
- **Stream:** `thought` parts are skipped; other text parts are yielded. The stream ends only on a candidate `finishReason` of `STOP`. Any other reason (`MAX_TOKENS`, `SAFETY`, `RECITATION`, ...), a blocked prompt with no candidates, an `error` frame, or a body that ends without `STOP` throws `upstream` (an `error` frame maps `RESOURCE_EXHAUSTED` to `rate_limit`, `UNAVAILABLE` to `overloaded`, `UNAUTHENTICATED` / `PERMISSION_DENIED` to `auth`).
- **Errors:** as the other adapters, plus one exception: an HTTP 400 body is read (first 10,000 characters) only to look for `API_KEY_INVALID`, which makes it `auth`; otherwise `invalid_request`. No upstream text is kept.
- **Models:** `GET /v1beta/models?pageSize=1000`; keep `gemini-*` ids that support `generateContent` and are not image, speech, embedding, live or similar; order by version number, newest first. Same cache, caps as the others.
- **Effort:** thinking models are `gemini-2.5*` and `gemini-3+` (by id); `ModelInfo.supportsEffort` says so. 2.5 models get `thinkingBudget` 1024 / 8192 / 24576 for low / medium / high, which fits every 2.5 model's range. Gemini 3 and later get `thinkingLevel` `low` / `high`; medium maps to `high` because `medium` is not accepted on every 3 model. Models without thinking get nothing.

### Trade-offs
- Family, version order and thinking support come from id patterns, unverified against live responses (`docs/VERSIONS.md`); a new naming scheme needs a pattern update. The `thinking` field of the models resource was not relied on.
- The budget numbers and the medium-to-high mapping are choices, not Google defaults.
- A 400 body is read once for its marker. Only the first 10,000 characters are inspected, but the body is buffered whole before slicing (like the model list), so memory is not bounded by that slice; the relay's stream deadline is the real limit.
- Ties on version put `lite`, `preview`, `exp` and `latest` ids after full ones, so the default model is a stable full release; with several full models of one version the API order decides.
- The roadmap line "hidden when unsupported" is met by the `supportsEffort` flag; the control itself waits for the provider/effort UI item.

---

## Validation & Verification
- Recorded-fixture tests: stream at several chunk sizes, thought parts skipped, key in header and not URL, role mapping, newest-model default, HTTP and 400-marker mapping, mid-stream error statuses, every non-STOP finish reason, blocked prompt, truncated stream, bad JSON, transport and abort, budget and level mapping, no effort for non-thinking models, model filtering and ordering, cache TTL and key isolation, caps, no raw key in the cache.

## Amendment (BP-fit-timeout)

When no effort is chosen, thinking models now get the `low` setting instead of no thinking config. With no config, 2.5 models think dynamically and 3 models default to high, and a fit check on such a model ran past the relay's 120 s stream deadline. Choosing Medium or High still raises it. Unverified with a live key: the cause is inferred from the request shape and Google's documented defaults, so confirm the fit check time with a real key (REDO-03 adds the stage and elapsed time that will show it).
