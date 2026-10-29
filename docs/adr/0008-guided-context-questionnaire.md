# ADR-0008: Guided Context Questionnaire and Standardized Answers

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `PROF-02a`

---

## Context and Problem Statement
`PROF-01` made the user write a markdown context pack by hand. Most people will not, and what they write is uneven. We want a one-time guided questionnaire that asks specific questions (including the most recent work experience in a fixed, clearly listed shape), stores the answers locally in one standardized, versioned structure, lets the user update them later, and turns them into the facts, stories and preferences that personalize every answer.

Constraints: SPEC section 5 (say exactly what is sent), the strict request contract (`profile` takes only `{id, text}` items and preferences), stable citation IDs (ADR-0007), and honest output (nothing the user did not say).

---

## Decision Drivers
- Contact details and current pay must not be able to reach the model, by construction and not by convention.
- An `F01` citation must keep pointing at the same claim when the user fixes a typo, reorders entries or edits an answer.
- A half-filled form must be saveable; the questionnaire is long.
- The hand-written pack from `PROF-01` must keep working next to it.

---

## Considered Options
**Source of truth.**
1. **A1:** The answers record is the truth. The profile is compiled from it and stored as a derived copy that keeps the ID ledger.
2. **A2:** Derive the profile on every read; store only answers. IDs cannot be stable.
3. **A3:** Compile answers to markdown and run the `PROF-01` import. Loses the answer-to-fact link, so editing an answer cannot keep an ID.

**ID stability.**
1. **C1:** Match on text only (as `PROF-01` does). An edited answer gets a new ID every time.
2. **C2:** Each repeatable entry gets a persisted `entryId`; every compiled fact carries a key such as `exp:3:ach:1`. Match on text first, then on key.

**Contexts.** One context, or several named ones. Several is deferred: nothing needs it yet.

---

## Decision Outcome
Chosen: **A1 + C2, one context.**

- `ContextAnswers` (`packages/core/src/context-answers.ts`) is a versioned zod schema with eleven sections. Every field is optional so a draft is valid; limits are still enforced. `revision` guards against stale windows and `nextEntry` issues `entryId`s that never repeat.
- The `private` section (email, phone, links, address, current pay) is typed out of the compiler: `compileAnswers` takes `PublicAnswers`, which has no `private` section. A sentinel test proves none of it reaches facts, stories, preferences, the markdown export or `toProfile`.
- `compileAnswers` renders one plain sentence per answer group using only what was typed. It computes nothing (no tenure, no totals) and infers nothing. An entry missing its required parts is skipped with a warning. Worst-case inputs are tested to stay at or under 2000 characters.
- `StoredProfile` becomes version 2. Each item has `origin: "answers" | "manual"` and, for answers, a `key`. Version 1 records upgrade on read with every item `manual`. Questionnaire preferences and rules live in `answerPrefs` / `answerRules`, so a markdown import cannot wipe them.
- `mergeCompiledContext` replaces only `answers` items; `reconcileProfile` (import) replaces only `manual` items. A sentence stated by both is kept once, as the questionnaire's. A questionnaire preference wins over an imported one with the same key, with a warning.
- IDs: unchanged text keeps its ID (reordering is safe); otherwise the same key keeps it (an edited answer); otherwise a new ID. Counters only grow, so a retired ID is never reissued.
- Storage: IndexedDB version 2 adds an `answers` store without touching `profile`. `saveWithCompiled` saves the answers and merges the compiled output into the profile as stored at that moment, in one transaction, so a stale window cannot undo an edit or removal made elsewhere. A stale revision refuses the write. `discard` also removes the items built from the answers.
- `toProfile` now picks `{id, text}` explicitly. Spreading items would have sent `origin` and `key` and failed every request, since the contract is strict.
- Never-claim statements are stored and labelled "not yet applied", exactly as `rules` are (ADR-0007). They are not smuggled into preferences.

### Positive Consequences
- One standardized record the user can update, and a PII boundary enforced by types plus a test.
- Citations survive edits and reordering.
- The old import flow keeps working and does not clobber questionnaire items.

### Negative Consequences / Trade-offs
- Two stores must stay in step; one transaction covers that.
- Editing an answer keeps its ID while its meaning may change. `VERIF-01` must snapshot the cited text in history to catch that.
- Achievements and scale metrics are keyed by position within a role. Deleting one and editing the next can move an ID to different content; a test pins this. `VERIF-01`'s text snapshot covers it.
- Items from answers cannot be edited in the facts list; the user changes the answer instead.
- The questionnaire's per-section data statements must be shown in the UI (`PROF-02b`).

---

## Pros and Cons of the Options

### A1 (chosen)
- Good, because it keeps the link from answer to fact, which stable IDs need.
- Bad, because the profile is a derived copy that has to be recompiled on save.

### A2
- Good, because there is no duplicated state.
- Bad, because IDs would have to be derived, and a derived ID is not stable.

### A3
- Good, because it reuses the importer.
- Bad, because it throws away the key, so C2 is impossible and PII filtering has to be redone on text.

### C1 / C2
- C1 is simple but churns IDs on every edit. C2 costs a counter and a key per fact, and fixes that.

---

## Validation & Verification
- Core tests: schema and questionnaire cover exactly the same fields; compiler honesty, limits and PII sentinels; merge ID behaviour (edit, reorder, delete, never reissue); v1 upgrade; `toProfile` sends only `{id, text}`; markdown round trip.
- Extension tests with `fake-indexeddb`: a real v1 database upgrades to v2 with its profile intact; revision guard; both stores written or neither; a stale window cannot undo a removal; discarding answers removes their items.
- Manual: see the PR description.
