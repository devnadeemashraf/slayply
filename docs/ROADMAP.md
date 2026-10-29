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
  - Turborepo orchestrates `check`, `lint`, `fmt:check`, and `test`.
  - Empty skeleton scripts print `"skip: skeleton only"` and exit with 0.
- **Required Tests:** `scripts/doctor.test.mjs`, `scripts/handoff-check.test.mjs`.

#### `BOOT-02`: Agent Harness, Standards & CI
- **Spec Section:** Non-Functional `[MUST]`
- **Size:** S (1 session)
- **Status:** Done
- **Acceptance Criteria:**
  - `AGENTS.md` acts as single source of truth for agent rules.
  - GitHub Actions runs `check`, `lint`, `test`, and `handoff-check`.
  - Git pre-commit, commit-msg, and pre-push hooks installed.
- **Required Tests:** CI runs green on PR.

---

### Phase 1: Core Relay & Extension Shell

#### `CORE-01`: Shared Schema & Core Types
- **Spec Section:** §6 Request/Response Contract `[MUST]`
- **Size:** S (1 session)
- **Status:** In review
- **Acceptance Criteria:**
  - `GenerateRequest` and `GenerateResponse` Zod schemas exported from `packages/core`.
  - Full TypeScript types inferred and exported.
  - Validation utility function `validateGenerateResponse` with retry prompt formatting.
- **Required Tests:** Schema unit tests covering happy, malformed, and missing field scenarios in `packages/core`.

#### `CORE-02`: Stateless Relay Service (`apps/relay`)
- **Spec Section:** §8 Hosting (Relay) `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Hono HTTP server running on Node with `@hono/node-server`.
  - `GET /health` endpoint returns `{ status: "ok", timestamp: ... }`.
  - `POST /v1/generate` receives `GenerateRequest` + user API key header, validates with Zod, and streams SSE.
  - Request size limited to 500 KB; IP rate limiter active (60 req/min).
  - Logs status and latency only; zero request/response payloads in logs.
- **Required Tests:** Vitest integration tests for `/health`, `/v1/generate` input validation, and header security.

#### `EXT-01`: WXT Side Panel Shell & Settings
- **Spec Section:** §2 What It Is, §8 Models `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Chrome Manifest V3 side panel opens via toolbar icon.
  - Basic settings screen to enter Anthropic API key, saved locally to `chrome.storage.local`.
  - Side panel pings relay `/health` on open and displays connection status indicator.
  - 🧪 **Manual Test:** Click extension icon in Chrome; confirm side panel opens cleanly, status shows "Connected" or "Relay Awake".

#### `GEN-01`: Basic Answer Generation Loop
- **Spec Section:** §4 Feature 5 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Paste box for JD and Question in side panel.
  - User clicks "Slay"; request sent to relay; streaming tokens render in UI.
  - "Copy to Clipboard" button copies text with visual feedback.
  - 🧪 **Manual Test:** Paste a 1-paragraph JD and 1 question; verify stream completes and clipboard contains identical text.

---

### Phase 2: Profile, Resumes & Grounded Verification

#### `PROF-01`: Context Pack Profile Management
- **Spec Section:** §4 Feature 1 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Import context pack markdown file; parser assigns stable IDs (`F01`, `S01`…).
  - In-app profile viewer and editor with local persistence in IndexedDB.
- **Required Tests:** Markdown parser tests for fact extraction and stable ID assignment.

#### `RES-01`: PDF Resume Upload & Parsing
- **Spec Section:** §4 Feature 2 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Upload PDF resume; client parses text via `pdf.js`.
  - Tag resume with track (FDE, SDE, custom) and region (master, gulf, india, remote).
  - Resumes stored locally in IndexedDB.
  - 🧪 **Manual Test:** Upload sample 2-page resume PDF; confirm plain text preview matches layout without garbage symbols.

#### `VERIF-01`: Claim Checker & Grounding Engine
- **Spec Section:** §4 Feature 6 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - System prompt enforces fact citing (`F01`, `S02`).
  - Claim checker flags any first-person sentence missing a valid Fact ID.
  - UI highlights uncited sentences in red with a "Remove" action button.
- **Required Tests:** Unit tests with mocked LLM outputs containing valid and invalid fact references.

#### `FIT-01`: Fit Check Analysis
- **Spec Section:** §4 Feature 4 `[MUST]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Generate match table (they want → you have), gaps, chance rating (low/medium/high), deal-breakers.
  - Suggests recommended resume track.
- **Required Tests:** Fixture tests verifying parsing of structured fit check response.

---

### Phase 3: Multi-Provider Support & Direct Mode

#### `PROV-01`: OpenAI & Gemini Adapters
- **Spec Section:** §4 Feature 8 `[SHOULD]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Provider interface implemented for Claude, OpenAI (GPT-4o), and Google Gemini (2.5 Flash / Pro).
  - Dynamic model list retrieval via `/v1/models?provider=`.
  - Reasoning effort controls (low, medium, high) mapped to provider-specific params.
- **Required Tests:** Recorded replay fixtures (VCR-style) for each provider adapter.

#### `DIRECT-01`: Direct Mode Client Toggle
- **Spec Section:** §4 Feature 8 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Toggle switch in settings for "Direct Mode" (bypasses relay entirely).
  - Direct calls use identical `packages/providers` adapters in browser context.
  - 🧪 **Manual Test:** Turn off relay, enable Direct Mode with personal key; verify generations still succeed.

---

### Phase 4: Capture & Application Workflow

#### `CAP-01`: Selection & Job Capture
- **Spec Section:** §4 Feature 3 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** Planned
- **Acceptance Criteria:**
  - Context menu item "Capture for Slayply" → [JD | Question | Note].
  - On non-LinkedIn boards: "Capture visible JD" button.
  - Auto-extract company, title, location where possible.
  - 🧪 **Manual Test:** Highlight text on Greenhouse job page, right-click, capture as JD; confirm side panel opens with text populated.

#### `HIST-01`: Job Log & Saved History
- **Spec Section:** §4 Feature 7 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Saved jobs view with status pipeline (Saved, Applied, Interviewing, Rejected, Offer).
  - Store answers submitted per job in IndexedDB for future reuse.
- **Required Tests:** IndexedDB repository tests for CRUD operations on job applications.

#### `GEN-02`: Cover Letter & Cold Messages
- **Spec Section:** §4 Feature 5 `[MUST]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:**
  - Specialized prompts for cover letters, recruiter messages, and cold emails.
  - Tone options: crisp, warm, bold.
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

---

## 5. Decisions Table

| ID | Title | Status | Chosen Option | Replaced / Alternatives |
| :--- | :--- | :--- | :--- | :--- |
| **ADR-0001** | Monorepo Structure & Tooling | Accepted | pnpm workspaces + Turborepo + Biome | npm workspaces, Nx, ESLint/Prettier |
| **ADR-0002** | Shared Request/Response Schema | Accepted | Zod schemas, inferred types, result-union validators | JSON Schema + Ajv, ad-hoc `parse()` |
| ADR-0003 (planned, EXT-01) | Extension Framework | Proposed | WXT (Vite + MV3) | Plasmo, Custom Webpack MV3 |
| ADR-0004 (planned, PROF-01) | Local Client Database | Proposed | IndexedDB with `idb` (DEC-003) | `chrome.storage.local` exclusively, SQLite WASM |
| ADR-0005 (planned, VERIF-01) | Grounding & Claim Integrity | Proposed | Fact ID tagging (`F01`) + deterministic claim validator | Vector semantic search, Freeform LLM self-reflection |

---

## 6. Spec Change Proposals

*(None approved yet. Any future changes to `docs/SPEC.md` must be proposed and logged here with what it replaces, cost, and risk.)*

---

## 7. Recurring Maintenance Items

- **Monthly:** Run `pnpm update --interactive` for dependencies; verify pins in `docs/VERSIONS.md`.
- **Phase Grooming:** At the conclusion of each milestone, audit open bugs, review performance budgets, and groom next phase items.

---

## 8. Status Log

- **2026-10-29:** `CORE-01` in review: bounded, strict request schema; tolerant response schema; shared validators with one-shot retry prompt.

- **2026-10-29:** `BP-001` fixed: lint/format scripts no longer swallow Biome failures; doctor enforces real pins; handoff guard also requires HANDBOOK updates for new modules; git hooks install via `prepare`; CI uses a frozen lockfile.

- **2026-10-29:** `BOOT-01` completed. Package skeleton finalized, doctor pins verified (Node, pnpm, git, VERSIONS, turbo, Biome), Turborepo test and pipeline checks integrated into root CI script.
- **2026-10-29:** Phase 0 initiated. Monorepo skeleton initialized, git repo initialized on `main`, scaffolding docs and CI pipelines created.
