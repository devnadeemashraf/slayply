# ADR-0014: Provider, Model and Effort in the Request

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `PROV-04`

---

## Context and Problem Statement
The OpenAI and Gemini adapters and every effort control were unreachable: `GenerateRequest` had no model or effort field, adapters take them only when built, and the side panel stored one Anthropic key. The user needs to choose a provider, a model and an effort, and the relay must treat the model id as untrusted text.

---

## Decision Drivers
- A model id comes from the client and ends up in a provider request (Gemini puts it in the URL path).
- Keys travel only in headers, never in the body or logs (SPEC §5).
- Older clients that send none of the new fields must keep working.
- One PR: no change to the adapter interface.

---

## Considered Options
1. **Optional `provider`, `model` and `effort` in the request body (SPEC §6 change); the relay checks the model against the provider's own list and builds the adapter for that request.**
2. Headers (`X-Slayply-Model`, `X-Slayply-Effort`): no Spec change, but validation is split between headers and body, and the CORS allow-list grows.
3. Per-call options on `ProviderAdapter.stream`: the cleanest long-term, but it changes all three adapters and their tests.

---

## Decision Outcome
Chosen Option: **1**, approved as a Spec change on 2026-10-30.

- `provider` is optional and, when sent, must equal the provider of the key header (else `400 PROVIDER_MISMATCH`), so a key never goes to a vendor the user did not mean.
- `model` must match `^[\w.:-]{1,64}$` in the schema and be an id in the provider's cached model list (else `400 UNKNOWN_MODEL`). A model-list failure maps to the same static upstream errors as `GET /v1/models`. The raw model string is never logged.
- `effort` is an enum. The adapters already ignore it for models that do not support it.
- The relay builds the adapter for a request through `adapterFor(providerId, { model, effort })`, only when one of them is set; otherwise it uses the registered adapter. The model list still comes from the registered adapter, so its cache is kept.
- The key-format check now runs before the open-stream slot is taken, so a bad key can no longer leak a slot.
- The extension keeps one key per provider (`anthropicKey`, `openaiKey`, `geminiKey` in the existing settings record, so nothing migrates), plus the chosen `provider`, `model` and `effort`. Keys are still excluded from backups.
- Direct Mode stays Claude only. With Direct Mode on and another provider chosen, Slay and Check fit show a message instead of sending the key anywhere.

### Positive Consequences
- All three providers and the effort controls are usable from the panel.
- Additive: requests without the fields behave as before.

### Negative Consequences / Trade-offs
- A request that names a model costs one cached model-list call to the provider.
- Adapters are built per request when a model or effort is chosen (they are cheap closures).
- Claude has no effort control yet (`supportsEffort` is never set for Claude).

---

## Validation & Verification
Schema tests for each field; relay tests for mismatch, unknown model, list failure, no listing when no model, and no model in logs; settings, request-builder, relay-client header, models-client and picker tests in the extension. Manual test in a real extension is listed in `docs/POINTER.md`.
