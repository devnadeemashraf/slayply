# ADR-0002: Shared Request/Response Schema

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `CORE-01`

---

## Context and Problem Statement
The extension, the relay and (later) the provider adapters all exchange `GenerateRequest` and `GenerateResponse` (SPEC §6). Without a single definition they drift. Two things also need to be handled deliberately:

1. Request bodies come from outside the relay's trust boundary and must be bounded (SPEC §5: 500 KB cap, input sanitization).
2. Model output is non-deterministic JSON. SPEC §6 says: validate, retry once with the error message, then show the raw text.

---

## Decision Drivers
- Types and runtime validation must not be able to disagree.
- The relay must reject abusive input cheaply and predictably.
- A rejected model reply should cost the user one retry at most, not a hard failure.
- The same code runs in the browser and in Node, so `packages/core` may not depend on Node or DOM types.

---

## Considered Options
1. **Zod schemas, types inferred from them, and thin validation helpers returning a result union.**
2. TypeScript interfaces plus JSON Schema and Ajv.
3. Zod schemas only; each caller wraps `parse()` in its own try/catch.

---

## Decision Outcome
Chosen Option: **1**.

- Types come from `z.infer`, so there is no second definition to drift.
- Requests use `z.strictObject`: unknown keys are rejected, not silently dropped, so a client typo or an injected field fails loudly. Responses use plain objects: a model adding a stray key should not force a retry.
- Every string and array has a ceiling (`LIMITS` in `limits.ts`). These sit well under the 500 KB body cap so one field cannot consume the whole budget.
- Citation IDs are validated as `F01` / `S03` shapes; fact and story IDs and question IDs must be unique. `answers` requires at least one question. Job URLs must be `http(s)`.
- `validateGenerateRequest` and `validateGenerateResponse` accept an object or a raw JSON string and return `{ success: true, data } | { success: false, issues, rawInput }`. Only the response variant adds `retryPrompt`, because a retry prompt is meaningful for a model and not for a client request.
- Uncited claims (`factIds: []`) are deliberately schema-valid. Detecting and flagging them is the claim checker's job (`VERIF-01`), and rejecting the whole reply for one uncited sentence would defeat the "remove in one tap" UX.

### Trade-offs
- `zod` becomes a runtime dependency of `@slayply/core` (pinned in `docs/VERSIONS.md`).
- Limits are product decisions baked into the contract; raising one is a deliberate change here.
- The string-length guard before `JSON.parse` counts characters, a lower bound on bytes. The relay still enforces the real byte limit on the body.
- `@slayply/core` ships compiled output (`dist/`) so Node consumers need no TypeScript loader. Turbo builds it before dependents run `typecheck` or `test`.

---

## Validation & Verification
- `schema.test.ts` and `validate.test.ts`: happy, sad, edge and abuse paths (unknown keys, `javascript:` URLs, oversized fields, duplicate IDs, `__proto__` preference keys, malformed JSON).
- Mutation spot-check during review: relaxing `strictObject`, the URL protocol rule, or the `answers` rule each makes a test fail.
- `tsc -p tsconfig.json` type-checks source and tests, with `types: []` so Node-only APIs fail to compile.
