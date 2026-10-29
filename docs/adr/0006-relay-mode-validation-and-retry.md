# ADR-0006: Relay-Mode Validation, Retry and Streaming Preview

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `GEN-01`

---

## Context and Problem Statement
The model replies with JSON (`GenerateResponse`, SPEC §6), so the relay streams raw JSON text. The relay takes only a `GenerateRequest`, builds the prompt itself and never validates or retries (ADR-0004), so a relay-mode client cannot send the repair prompt that `generateValidated` uses in Direct Mode. `GEN-01` must still show streaming text, copy the final answer, and cope with invalid replies. Three choices will last:

1. What the panel shows while the JSON streams.
2. What happens when the reply fails validation.
3. What request is sent before resumes and profiles exist.

---

## Considered Options
**Streaming display**
1. Show the raw JSON as it arrives.
2. Wait for the end, then render.
3. **Extract the first `"text"` string from the partial JSON and show it as a labelled draft; replace it with the validated answer on `done`.**

**Invalid reply**
1. **Re-request once with the same request, then show the raw text labelled unvalidated.**
2. Show the raw text at once and offer a manual retry.
3. Extend the relay with an optional `repair` field.

**Request without a profile**
1. Add a resume textarea now.
2. **Send an empty profile and a resume text that says no resume was provided and forbids invention.**
3. Make `resume` optional in the contract.

---

## Decision Outcome
- **Display:** option 3. `extractAnswerPreview` is a small pure function that decodes escapes, stops at the closing quote and never returns half an escape. The preview is unvalidated, so Copy stays disabled until validation passes. A reply with no `"text"` key shows an empty draft, which is the same as waiting.
- **Retry:** option 1. The client validates with `validateGenerateResponse` (after stripping one code fence) and, on failure, calls the relay again once; a second failure shows the raw text with "Unvalidated, check before use" and Copy allowed. Only validation failures retry. Relay `error` events, HTTP errors and network failures show the relay's static message and never retry. Cancelling returns to idle. Option 3 changes the relay contract and is not worth it for an unmeasured failure rate.
- **Request:** option 2. The roadmap's manual test is a job description and one question, and the contract (ADR-0002) requires resume text. The marker text is honest, sends no fabricated facts, and the UI states that answers will be generic. `RES-01` and `PROF-01` replace it. Option 3 would be thrown away, and option 1 adds a field that `RES-01` removes.
- **Guards:** a reply over 200,000 characters stops with a `TOO_LARGE` error (valid outputs are capped far below that), and `createGenerationRunner` lets only the newest run report state so a cancelled run's late `idle` cannot wipe a new run.
- **Placement:** `apps/extension/src/lib` (DOM-free, `fetch` injected) and `src/components`; not under `entrypoints/`, which WXT treats as entrypoints. A shared package is premature while only the extension uses the code.
- **Tests:** the roadmap asks for component tests. The logic is tested on Node (SSE reader, preview extractor cut at every index, relay client, controller against a stubbed relay `Response`, copy feedback with fake timers) and the view is tested with `react-dom/server` `renderToString` per state. No DOM library was added, so ADR-0005's choice stands. Click handling and the real clipboard are covered by the manual test.

---

## Consequences
- A reply that fails validation costs a second generation on the user's key and a second wait. Revisit option 3 (a relay `repair` field) if repairs prove common.
- Direct Mode (`DIRECT-01`) uses `generateValidated`, which repairs in a single conversation instead.
- Answers are generic until `RES-01` and `PROF-01`; the warnings list from the model is shown under the answer.
- Bundle grows to about 327 kB (measured) because the panel now bundles `zod` through `@slayply/core` and imports `stripCodeFence` from `@slayply/providers`.
