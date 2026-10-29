# Slayply — Product Roadmap & Execution Plan

---

## 1. Roadmap Overview & Timeline

- **Mode:** BUILD (Mentor/Learn modules available on demand)
- **Target Velocity:** 1–3 PRs per week (Solo + AI)
- **Phase 0 (Bootstrap):** Empty monorepo skeleton, green CI, AI PR loop verified. (Est: Week 1)
- **Phase 1 (Core Relay & Side Panel Shell):** WXT panel with Claude provider, streaming answers via Hono relay. (Est: Weeks 2–3)
- **Phase 2 (Profile, Resumes & Grounded Matching):** Context pack, IndexedDB, PDF parsing, fit check, claim verification. (Est: Weeks 4–5)
- **Phase 3 (Multi-Provider Support & Direct Mode):** OpenAI, Gemini, reasoning effort controls, Direct client mode. (Est: Week 6)
- **Phase 4 (Capture & Application Workflow):** Context menu capture, history, cover letters, messages. (Est: Week 7)
- **Phase 5 (Polish & Open Source Release):** Gen-Z themes, static site, README, security audit, release v1.0.0. (Est: Week 8)

---

## 2. Measurable Budgets

| Metric | Target Budget | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Relay First-Token Latency** | < 1500 ms (awake) | Automated integration benchmark |
| **Relay Cold-Start UI Guard** | < 60s timeout fallback | Extension timeout handler switching to Direct Mode |
| **Side Panel Memory Footprint** | < 60 MB RSS | Playwright panel heap snapshot |
| **Extension Bundle Size** | < 3.5 MB uncompressed | CI build size check on `apps/extension` |
| **Relay Docker/Memory Footprint**| < 128 MB RAM | Render free tier limit check (limit: 512 MB) |
| **Monorepo Build Time** | < 45s cold | Turborepo cache metrics |

---

## 3. Top Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Render Free Tier Cold Start (50s sleep)** | User gets stuck waiting for answers on initial request. | Extension immediately pings `/health` when panel opens; lively UI state shows warming progress; auto-offers Direct Mode if relay exceeds 60s. |
| **LinkedIn Anti-Bot Terms & IP Bans** | Extension flagged or user account penalized. | Zero DOM mutation, zero background scraping, zero automated clicks. On LinkedIn, user explicitly selects text and presses "Capture Selection". All answers are manually copied and pasted. |
| **LLM Output Hallucination / Uncited Claims** | User submits false credentials or fabricated numbers. | Two-pass claim checking in `packages/core`: every assertion in first-person must reference a profile Fact ID (`F01`, `S03`). Uncited claims are visually flagged in red and removable in one click. |

---

## 4. Phase Breakdown & Work Items

### Phase 0: Bootstrap & Foundation

#### `BOOT-01`: Monorepo Workspace & Build Pipeline
- **Spec Section:** §3 Monorepo `[MUST]`
- **Size:** S (1 session)
- **Status:** Done
- **Acceptance Criteria:**
  - `pnpm install` succeeds across all workspaces (`apps/*`, `packages/*`).
  - Turborepo orchestrates `build`, `typecheck` and `test`; the root `pnpm run check` runs everything else.
  - Tasks for unbuilt code print `skip: <reason>` (naming the roadmap item that adds them) and exit 0.
- **Required Tests:** `scripts/doctor.test.mjs`, `scripts/handoff-check.test.mjs`.

#### `BOOT-02`: Agent Harness, Standards & CI
- **Spec Section:** Non-Functional `[MUST]`
- **Size:** S (1 session)
- **Status:** Done
- **Acceptance Criteria:**
  - `AGENTS.md` acts as single source of truth for agent rules.
  - GitHub Actions runs one `check` job (doctor, handoff, format, lint, test, typecheck).
  - Git pre-commit, commit-msg, and pre-push hooks installed.
- **Required Tests:** `scripts/*.test.mjs` cover doctor, handoff guard, hook setup and the agent guard; CI runs green on every PR.

---

### Phase 1: Core Relay & Extension Shell

#### `CORE-01`: Shared Schema & Core Types
- **Spec Section:** §6 Request/Response Contract `[MUST]`
- **Size:** S (1 session)
- **Status:** Done
- **Acceptance Criteria:**
  - `GenerateRequest` and `GenerateResponse` Zod schemas exported from `packages/core`.
  - Full TypeScript types inferred and exported.
  - Validation utility function `validateGenerateResponse` with retry prompt formatting.
- **Required Tests:** Schema unit tests covering happy, malformed, and missing field scenarios in `packages/core`.

#### `CORE-02`: Stateless Relay Service (`apps/relay`)
- **Spec Section:** §8 Hosting (Relay) `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - Decide how Node runs and bundles the TypeScript (ADR first).
  - Hono HTTP server running on Node with `@hono/node-server`.
  - `GET /health` endpoint returns `{ status: "ok", timestamp: ... }`.
  - `POST /v1/generate` receives `GenerateRequest` + user API key header, validates with Zod, and streams SSE.
  - Request size limited to 500 KB; IP rate limiter active (60 req/min).
  - Logs status and latency only; zero request/response payloads in logs.
  - CORS allows only `chrome-extension://<EXTENSION_ID>` and `http://localhost:*`; no wildcard.
  - Provider keys are read only from `X-User-Anthropic-Key`, `X-User-OpenAI-Key`, `X-User-Gemini-Key`, never logged, echoed or stored.
  - Errors use the structured JSON shape in `docs/CODING_STANDARDS.md`; non-JSON and binary bodies are rejected.
  - The in-memory rate limiter resets on restart (Render free may restart at any time): document this.
- **Required Tests:** Vitest integration tests for `/health`, `/v1/generate` input validation, header security, CORS allow/deny, the 500 KB cap, rate limiting, and that no payload or key appears in log output.

#### `CORE-03`: Prompt Builder
- **Spec Section:** §7 System Prompt, §3 Core `[MUST]`
- **Size:** S (1 session)
- **Status:** Done
- **Acceptance Criteria:**
  - `packages/core` turns a validated `GenerateRequest` into provider-neutral messages that encode the seven §7 rules, including the track-specific structure and the honest answer to AI-detection questions.
  - Every profile fact and story is included with its ID so the model can cite it.
- **Required Tests:** Snapshot tests per task kind; `maxChars`, tone and length appear in the prompt; a job description containing instructions cannot alter the system rules (prompt-injection probe).

#### `EXT-01`: WXT Side Panel Shell & Settings
- **Spec Section:** §2 What It Is, §8 Models `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - Chrome Manifest V3 side panel opens via toolbar icon.
  - Basic settings screen to enter Anthropic API key, saved locally to `chrome.storage.local`.
  - Side panel pings relay `/health` on open and displays connection status indicator.
  - First run shows the privacy statement from SPEC §5 and requires acknowledgement before any generation.
  - 🧪 **Manual Test:** Click extension icon in Chrome; confirm side panel opens cleanly, status shows "Connected" or "Relay Awake".
- **Required Tests:** Unit tests for the settings store and the relay-status state machine (awake, warming, 60 s timeout offers Direct Mode).

#### `PROV-01`: Provider Interface & Claude Adapter
- **Spec Section:** §4 Feature 8 `[MUST]`, §3 Providers
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - One provider interface in `packages/providers`; the Claude adapter streams text and returns JSON validated with `validateGenerateResponse` (retry once with the retry prompt, then surface the raw text).
  - Model list is fetched from the provider's models endpoint and cached, never hard-coded.
  - Runs in both Node (relay) and the browser (Direct Mode).
- **Required Tests:** Recorded-fixture tests (no live network): happy stream, malformed JSON then repaired retry, repeated failure falls back to raw text, provider error mapping.

#### `GEN-01`: Basic Answer Generation Loop
- **Spec Section:** §4 Feature 5 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - Paste box for JD and Question in side panel.
  - User clicks "Slay"; request sent to relay; streaming tokens render in UI.
  - "Copy to Clipboard" button copies text with visual feedback.
  - 🧪 **Manual Test:** Paste a 1-paragraph JD and 1 question; verify stream completes and clipboard contains identical text.
- **Required Tests:** Component tests for the stream renderer and copy button; an end-to-end test against a stubbed relay.

---

### Phase 2: Profile, Resumes & Grounded Verification

#### `PROF-01`: Context Pack Profile Management
- **Spec Section:** §4 Feature 1 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - Import context pack markdown file; parser assigns stable IDs (`F01`, `S01`…).
  - In-app profile viewer and editor with local persistence in IndexedDB.
- **Required Tests:** Markdown parser tests for fact extraction and stable ID assignment.

#### `PROF-02a`: Guided Context Questionnaire (core and storage)
- **Spec Section:** §4 Feature 1 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - One versioned, standardized answers structure (sections for you, targets, most recent work experience first, education, skills, projects, STAR stories, voice, standard answers, never-claim, private).
  - Questionnaire definition with help text, examples and a per-section statement of what is sent.
  - Answers compile to facts, stories and preferences with stable IDs; private details cannot reach the output.
  - Answers saved locally in IndexedDB (version 2) with a migration that keeps the existing profile.
- **Required Tests:** PII sentinel, compiler honesty and 2000-character limits, ID stability (edit, reorder, delete), v1 to v2 migration, atomic save.

#### `PROF-02b`: Guided Context Questionnaire (wizard UI)
- **Spec Section:** §4 Feature 1 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Done
- **Acceptance Criteria:**
  - Step-by-step wizard with progress, autosave, inline validation, add/remove/move for repeatable entries.
  - Shows per section what is sent and what stays on the device.
  - Answers JSON export/import (preview first) and compiled markdown export.
- **Required Tests:** Renderer tests, reducer tests, markdown round trip.

#### `RES-01`: PDF Resume Upload & Parsing
- **Spec Section:** §4 Feature 2 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** In review
- **Acceptance Criteria:**
  - Upload PDF resume; client parses text via `pdf.js`.
  - Tag resume with track (FDE, SDE, custom) and region (master, gulf, india, remote).
  - Resumes stored locally in IndexedDB.
  - 🧪 **Manual Test:** Upload sample 2-page resume PDF; confirm plain text preview matches layout without garbage symbols.
- **Required Tests:** Parser tests on fixture PDFs (text, multi-column, scanned with no text layer, oversized file, corrupt file).

#### `VERIF-01`: Claim Checker & Grounding Engine
- **Spec Section:** §4 Feature 6 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** In review
- **Acceptance Criteria:**
  - System prompt enforces fact citing (`F01`, `S02`).
  - Questions that try to detect AI-written answers get an honest reply that discloses AI-assisted drafting.
  - Claim checker flags any first-person sentence missing a valid Fact ID.
  - UI highlights uncited sentences in red with a "Remove" action button.
- **Required Tests:** Unit tests with mocked LLM outputs containing valid and invalid fact references.

#### `FIT-01`: Fit Check Analysis
- **Spec Section:** §4 Feature 4 `[MUST]`
- **Size:** S (1 session)
- **Status:** In review
- **Acceptance Criteria:**
  - Generate match table (they want → you have), gaps, chance rating (low/medium/high), deal-breakers.
  - Suggests recommended resume track and region; the user can override it.
  - Includes a suggested salary answer; runs once per job and caches the result.
- **Required Tests:** Fixture tests verifying parsing of structured fit check response.

---

#### `SET-01`: Settings, Export/Import & Data Wipe
- **Spec Section:** §4 Feature 9 `[MUST]` / `[SHOULD]`
- **Size:** S (1 session)
- **Status:** In review
- **Acceptance Criteria:**
  - Export and import everything (settings, profile, resumes, jobs, history) as JSON, validated on import.
  - One-tap wipe of all local data, with confirmation. `[MUST]`
  - Warn before sending data to a provider tier that trains on inputs. `[SHOULD]`
  - Privacy statement is reachable from settings.
- **Required Tests:** Round-trip export/import; malformed and hostile import files are rejected without partial writes; wipe leaves no stored keys or records.

### Phase 3: Multi-Provider Support & Direct Mode

#### `PROV-02`: OpenAI Adapter
- **Spec Section:** §4 Feature 8 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - OpenAI adapter behind the `PROV-01` interface; record the Chat Completions vs Responses choice in an ADR.
  - Models fetched from `GET /v1/models`; reasoning effort (low, medium, high) mapped to the provider parameter and hidden when the model does not support it.
- **Required Tests:** Recorded-fixture replay for stream, error and effort mapping.

#### `PROV-03`: Gemini Adapter & Relay Model Listing
- **Spec Section:** §4 Feature 8 `[SHOULD]`, §8 Hosting
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Gemini adapter behind the `PROV-01` interface; thinking/effort mapped per model and hidden when unsupported.
  - Relay `GET /v1/models?provider=` returns each provider's cached model list.
- **Required Tests:** Recorded-fixture replay; relay endpoint tests for an unknown provider and a missing key.

#### `DIRECT-01`: Direct Mode Client Toggle
- **Spec Section:** §4 Feature 8 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Toggle switch in settings for "Direct Mode" (bypasses relay entirely).
  - Direct calls use identical `packages/providers` adapters in browser context.
  - 🧪 **Manual Test:** Turn off relay, enable Direct Mode with personal key; verify generations still succeed.
- **Required Tests:** Unit tests that Direct Mode bypasses the relay client and never sends the key to any non-provider origin.

---

### Phase 4: Capture & Application Workflow

#### `CAP-01`: Selection & Job Capture
- **Spec Section:** §4 Feature 3 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Context menu item "Capture for Slayply" → [JD | Question | Note].
  - On non-LinkedIn boards: "Capture visible JD" button.
  - A "Capture selection" panel button alongside the context menu, and a paste box fallback.
  - Auto-extract company, title, location and salary text where possible; every field is editable.
  - 🧪 **Manual Test:** Highlight text on Greenhouse job page, right-click, capture as JD; confirm side panel opens with text populated.
- **Required Tests:** Extraction tests on fixture HTML; a test that nothing is captured on LinkedIn without an explicit selection.

#### `HIST-01`: Job Log & Saved History
- **Spec Section:** §4 Feature 7 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Saved jobs view with status pipeline (Saved, Applied, Interviewing, Rejected, Offer).
  - Store answers submitted per job in IndexedDB; offer a past answer when a similar question appears.
- **Required Tests:** IndexedDB repository tests for CRUD operations on job applications.

#### `GEN-02`: Cover Letter & Cold Messages
- **Spec Section:** §4 Feature 5 `[MUST]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Specialized prompts for cover letters, recruiter messages, and cold emails.
  - Tone options: crisp, warm, bold; regenerate a single answer; shorten or lengthen.
  - Relocation note task.
  - Character limit fitter respects strict recruiter limits (e.g. 300 chars for LinkedIn note).
- **Required Tests:** Character-limit boundary tests and tone prompt generation tests.

---

### Phase 5: Polish & Open-Source Launch

#### `THEME-01`: Gen-Z Design System
- **Spec Section:** §4 Feature 10 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Neon, Bubblegum, and Brutal dark presets.
  - Micro-interactions, copy button pop feedback, WCAG AA contrast check.
- **Required Tests:** Visual regression / snapshot tests in `packages/ui`.

#### `SITE-01`: Landing Page & Deployment Blueprint
- **Spec Section:** §8 Hosting `[MUST]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - `apps/site` static landing page with privacy policy and installation steps.
  - `render.yaml` blueprint tested for one-click self-hosting of relay.
- **Required Tests:** Playwright smoke test on static site build.

#### `QA-01`: End-to-End Smoke Test & Budget Gates
- **Spec Section:** §3 Tests, §5 Performance Budgets `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Playwright smoke test loads the built extension and opens the panel.
  - CI fails when the extension exceeds 3.5 MB uncompressed; a recorded check of panel memory against the 60 MB budget.
  - Relay first-token latency measured against a stubbed provider.
- **Required Tests:** The smoke test itself, plus a deliberate over-budget fixture that proves the gate fails.

#### `REL-01`: Security Review, Web Store Packaging & v1.0.0
- **Spec Section:** §5 Security Model, §9 Out of Scope `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Red-team pass over relay, parsing and rendering; findings fixed or logged.
  - Permissions minimized and justified; store listing, icons and privacy text prepared.
  - Tagged v1.0.0 with release notes.
- **Required Tests:** Regression tests for each fixed finding; `pnpm run check` green on the tagged commit.

---

## 5. Decisions Table

| ID | Title | Status | Chosen Option | Replaced / Alternatives |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-0001** | Monorepo Structure & Tooling | Accepted | pnpm workspaces + Turborepo + Biome | npm workspaces, Nx, ESLint/Prettier |
| **ADR-0002** | Shared Request/Response Schema | Accepted | Zod schemas, inferred types, result-union validators | JSON Schema + Ajv, ad-hoc `parse()` |
| **ADR-0003** | Relay Runtime, Build and Request Guards | Accepted | Hono on Node, tsc build, guards in the app | n/a |
| **ADR-0004** | Provider Interface & Claude Adapter | Accepted | `ProviderAdapter` in `packages/providers`, one repair retry | n/a |
| **ADR-0005** | Extension Shell & Testable Logic | Accepted | WXT (Vite + MV3); logic in injected-dependency modules | Plasmo, hand-rolled Vite, logic inside React components |
| **ADR-0006** | Relay-Mode Validation, Retry & Streaming Preview | Accepted | Draft preview from partial JSON; re-request once, then raw text; no-resume marker request | Raw JSON stream, relay `repair` field, resume textarea |
| **ADR-0007** | Context Pack Profile, Stable IDs & Local Storage | Accepted | Heading-driven markdown parsed in core; persisted ID ledger; one `idb` record; rules stored but not applied | YAML/LLM import, hash or positional IDs, rules in prefs, per-item stores |
| **ADR-0008** | Guided Context Questionnaire & Standardized Answers | Accepted | Answers record is the truth; compiled, origin-tagged profile (v2); typed-out `private` section; entry-keyed stable IDs; one context | Derive-only, compile-to-markdown, text-only IDs, named contexts |
| **ADR-0010** | Claim Checker & Grounding | Accepted | Deterministic text-based check in core against the profile that was sent; exact claim match; flag when unsure | Trust model claims, resume `R` IDs (follow-up), LLM verifier pass |

---

## 6. Spec Change Proposals

*(None approved yet. Any future changes to `docs/SPEC.md` must be proposed and logged here with what it replaces, cost, and risk.)*

---

## 7. Recurring Maintenance Items

- **Monthly:** Run `pnpm update --interactive` for dependencies; verify pins in `docs/VERSIONS.md`.
- **Phase Grooming:** At the conclusion of each milestone, audit open bugs, review performance budgets, and groom next phase items.

---

## 8. Status Log

- **2026-10-29:** `RES-01` in review: upload a PDF resume, read it in the browser (nothing uploaded), preview the extracted text, tag it with a track and region, store the text locally (IndexedDB v3) and pick a resume per answer. Extension is 2.10 MB of 3.5 MB (ADR-0009).
- **2026-10-29:** `PROF-02b` in review: the questionnaire in the side panel, one section per step with progress, autosave on a short delay, on blur and on step change, inline errors, add/remove/move for roles and other entries, "Use these answers" to build the profile, answers JSON export/import (preview first) and context-pack markdown export. Facts built from answers are marked and edited through the answers (ADR-0008).
- **2026-10-29:** `SET-01` in review: export/import everything as one versioned JSON file (validated in full, replaced in one transaction), a confirmed one-tap wipe of every store and the stored key, the privacy statement and a training-tier warning in settings. The API key and privacy acknowledgement are not exported.
- **2026-10-29:** `PROF-02a` done (PR #20).
- **2026-10-29:** `PROF-02a` in review: standardized, versioned answers structure and the question list, a compiler that turns answers into cited facts without inventing anything, private details typed out of it, origin-tagged profile (v2) with entry-keyed stable IDs, and IndexedDB v2 with a migration (ADR-0008). The wizard UI is `PROF-02b`.
- **2026-10-29:** `PROF-01` done: import a markdown context pack (preview first), stable `F01` / `S01` IDs that survive re-import and are never reused, in-app view, edit, add and remove, stored in IndexedDB, and sent with generation requests. Rules are stored but not yet applied (ADR-0007, `docs/CONTEXT_PACK.md`).

- **2026-10-29:** `GEN-01` done: the side panel takes a job description and a question, streams a draft from the relay, validates the reply (one re-request, then raw text) and copies the answer with visible feedback. Answers are generic until `RES-01` / `PROF-01` (ADR-0006).

- **2026-10-29:** `EXT-01` done: `apps/extension` builds an MV3 side panel with WXT and React (227 kB). It stores the Anthropic key in `chrome.storage.local`, shows the SPEC §5 privacy statement until acknowledged, and pings the relay `/health` with a warm-up state and a 60 s Direct Mode offer (ADR-0005).

- **2026-10-29:** `PROV-01` done: `packages/providers` has the shared adapter interface, the Claude streaming adapter, a cached model list and `generateValidated` (one repair retry, then raw text). The relay now serves Claude, `GET /v1/models`, a stream deadline, a per-IP open-stream cap and a body-read timeout (ADR-0004).

- **2026-10-29:** `CORE-03` done: `buildPrompt` in `packages/core` turns a `GenerateRequest` into a provider-neutral `{ system, messages }`; user data sits in `<slayply-*>` blocks with forged tags neutralised.

- **2026-10-29:** `BP-004` fixed: `claude-guard` blocked reads of `docs/SPEC.md` and `node_modules/*/dist`; found by an independent audit when the reviewer could not read the spec.

- **2026-10-29:** `BP-003` fixed: `claude-guard` read a backslash path as a literal filename on POSIX, bypassing the protected-path check. Found by CI on Linux.

- **2026-10-29:** `BP-002` done: README, CONTRIBUTING, SECURITY, Claude Code harness (`scripts/claude-guard.mjs`, `.claude/`).

- **2026-10-29:** `BP-006`: handoff cleanup. `CORE-01` was delivered to `main` by PR #9 after the stacked PR #3 merged into a parent branch; merged branches deleted.
- **2026-10-29:** `BP-005`: documentation accuracy pass from an independent audit; added roadmap items `CORE-03`, `PROV-01` (Claude), `SET-01`, `QA-01`, `REL-01` and split the old `PROV-01` into `PROV-02`/`PROV-03`.
- **2026-10-29:** `CORE-01` merged: bounded, strict request schema; tolerant response schema; shared validators with one-shot retry prompt.

- **2026-10-29:** `BP-001` fixed: lint/format scripts no longer swallow Biome failures; doctor enforces real pins; handoff guard also requires HANDBOOK updates for new modules; git hooks install via `prepare`; CI uses a frozen lockfile.

- **2026-10-29:** `BOOT-01` completed. Package skeleton finalized, doctor pins verified (Node, pnpm, git, VERSIONS, turbo, Biome), Turborepo test and pipeline checks integrated into root CI script.
- **2026-10-29:** Phase 0 initiated. Monorepo skeleton initialized, git repo initialized on `main`, scaffolding docs and CI pipelines created.
