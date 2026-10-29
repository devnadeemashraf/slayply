# ADR-0010: Claim Checker and Grounding

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `VERIF-01`

---

## Context and Problem Statement
SPEC section 4 Feature 6: every sentence about the user must cite a fact, uncited ones are shown in red and can be removed in one tap, and bot-filter questions get an honest reply. The response already carries `claims: [{ sentence, factIds }]` (ADR-0002), and the prompt already tells the model to cite and to answer AI-detection questions honestly. What is missing is a check that does not just believe the model's own list.

---

## Decision Drivers
- A model that omits a claim, or forges an ID, must not look "verified".
- A false red costs one click; a missed claim costs trust. When unsure, flag.
- No second model call, no new network path, no contract change.
- Profile facts keep their ID when edited in the app (ADR-0007, ADR-0008), so a citation must be judged against the text that was sent.

---

## Considered Options
1. **A: Deterministic check in `packages/core`.** Split the answer text into sentences, decide from the text itself which are first person, and match each to a claim by exact normalized text.
2. **B: Trust the model's `claims` only.** Cheapest, but an omitted claim escapes.
3. **C: Number resume sentences (`R01`) and make them citable.** Needs a contract and prompt change and a deterministic resume chunking; a separate item.
4. **D: A second LLM pass as verifier.** Doubles cost and latency, is non-deterministic, and sends the user's data through the relay twice.

---

## Decision Outcome
Chosen: **A. C is the planned follow-up for resume-derived sentences.**

- `checkClaims(text, claims, profile)` (`packages/core/src/claim-check.ts`) is a pure function. `profile` is the facts and stories that were sent with the request, carried on the `done` state, so the check uses the text in force at generation and a later edit cannot change what a citation meant. Each checked sentence carries the cited text as a snapshot.
- Sentences: one per line at least (a list item is its own sentence), then `Intl.Segmenter`. A wrong split only moves the red region; it never hides a sentence.
- A sentence is a claim when it contains a Latin first-person word (`I`, `my`, `me`, `mine`, `myself`, `we`, `our`, `ours`, `us`; `I'm`, `I'd` and curly apostrophes included). `i.e.` and lowercase `i` are not. Everything else is `not-a-claim`.
- A claim is `cited` only when the model lists that exact sentence (NFKC, collapsed whitespace, list marker and trailing punctuation ignored, no fuzzy match) with at least one ID and every ID exists in the profile that was sent. A paraphrased, missing, empty or forged citation is `uncited`; a mixed real and forged list is `uncited` too, and the forged IDs are reported.
- Prompt: one added instruction, "one claim entry for every sentence that speaks about the user, copied verbatim". The honest-reply rule (6) already existed and is pinned by a test.
- UI: uncited sentences are marked with a reason ("no matching citation" or "F99 not in your profile") and a Remove button. Removal edits a local copy of the text; the check re-runs on it, and Copy writes the edited text. Cited sources are listed below the answer.

---

## Consequences
- Resume-derived sentences have no citable ID, so they show red as "no matching citation" even when true. The reason text does not call them false. `C` fixes this.
- Non-English text with no Latin pronoun is `not-a-claim` and shows no flag. This is a known gap; there is no locale in the contract. The check is English-first.
- A sentence that refers to the user in the third person (their own name) is not checked. Line endings other than a line feed are not normalised (the model returns line feeds).
- Quoted speech and "we" for a team are flagged; accepted (fail toward flagging).
- The check proves a sentence points at a real fact, not that the sentence says what the fact says. It is a guard against invention, not a fact-check.
- History does not exist yet; when it does, store the snapshot text from the report, not just the IDs.
