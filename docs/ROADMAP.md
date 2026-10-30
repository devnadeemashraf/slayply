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
- **Status:** In review
- **Acceptance Criteria:**
  - OpenAI adapter behind the `PROV-01` interface; record the Chat Completions vs Responses choice in an ADR.
  - Models fetched from `GET /v1/models`; reasoning effort (low, medium, high) mapped to the provider parameter and hidden when the model does not support it.
- **Required Tests:** Recorded-fixture replay for stream, error and effort mapping.

#### `PROV-03`: Gemini Adapter & Relay Model Listing
- **Spec Section:** §4 Feature 8 `[SHOULD]`, §8 Hosting
- **Size:** S (1 session)
- **Status:** In review
- **Acceptance Criteria:**
  - Gemini adapter behind the `PROV-01` interface; thinking/effort mapped per model and hidden when unsupported.
  - Relay `GET /v1/models?provider=` returns each provider's cached model list.
- **Required Tests:** Recorded-fixture replay; relay endpoint tests for an unknown provider and a missing key.

#### `DIRECT-01`: Direct Mode Client Toggle
- **Spec Section:** §4 Feature 8 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** In review
- **Acceptance Criteria:**
  - Toggle switch in settings for "Direct Mode" (bypasses relay entirely).
  - Direct calls use identical `packages/providers` adapters in browser context.
  - 🧪 **Manual Test:** Turn off relay, enable Direct Mode with personal key; verify generations still succeed.
- **Required Tests:** Unit tests that Direct Mode bypasses the relay client and never sends the key to any non-provider origin.

#### `PROV-04`: Provider, Model & Effort Picker
- **Spec Section:** §4 Feature 8 `[MUST]`, §6 (Spec change, see §6 below)
- **Size:** M (2 sessions)
- **Status:** In review
- **Acceptance Criteria:**
  - Optional `provider`, `model` and `effort` on `GenerateRequest`; the relay rejects a provider that does not match the key header and a model the provider's list does not name.
  - The side panel stores one key per provider and lets the user pick provider, model (from `GET /v1/models`) and effort (hidden when the model does not support it).
  - Direct Mode stays Claude only and says so when another provider is chosen.
  - 🧪 **Manual Test:** Save an OpenAI key, pick it and a model, generate an answer through the relay; repeat with Gemini. Try a reasoning model and confirm the effort control shows; try one without and confirm it is hidden.
- **Required Tests:** Schema, relay (mismatch, unknown model, list failure, nothing logged), settings per-provider keys, header per provider, backup excludes keys, picker view.

---

### Phase 4: Capture & Application Workflow

#### `CAP-01`: Selection & Job Capture
- **Spec Section:** §4 Feature 3 `[MUST]`
- **Size:** M (2 sessions)
- **Status:** In review (PR pending)
- **Acceptance Criteria:**
  - Context menu item "Capture for Slayply" → [JD | Question | Note].
  - On non-LinkedIn boards: "Capture visible JD" button.
  - A "Capture selection" panel button alongside the context menu, and a paste box fallback.
  - Auto-extract company, title, location and salary text where possible; every field is editable.
  - 🧪 **Manual Test:** Highlight text on Greenhouse job page, right-click, capture as JD; confirm side panel opens with text populated.
- **Required Tests:** Extraction tests on fixture HTML; a test that nothing is captured on LinkedIn without an explicit selection.

#### `CAP-02`: One-Click Capture
- **Spec Section:** §4 Feature 3 `[MUST]` (wording change needed, ADR-0016)
- **Size:** M
- **Status:** In review (PR pending)
- **Acceptance Criteria:** Toolbar icon or Alt+Shift+S opens the panel and captures once (selection wins, else the visible page); nothing is read on LinkedIn without a selection; the capture fills the generate panel and Job details without extra clicks.
- 🧪 **Manual Test:** Greenhouse page, click the icon: panel opens with the job description filled. LinkedIn job, click with nothing selected: a refusal message; select text, click: it is used.
- **Plan (from `docs/research/one-click-capture-ux.md`):** `CAP-03` detect application questions (M), `CAP-04` single review screen with per-question generate (M), `CAP-05` optional job-site host permissions and iframes (M), `CAP-06` Greenhouse questions API (S), `CAP-07` stale-tab banner (S), `CAP-08` docs and hardening (S).

#### `CAP-03`: Detect Application Questions
- **Spec Section:** §4 Feature 3 `[MUST]` (label-reading wording: see ADR-0016)
- **Size:** M
- **Status:** In review (PR pending)
- **Acceptance Criteria:** `snapshotPage` returns `questions[]` (label, type, required, `maxChars`) from label, legend, aria and placeholder text, including open shadow roots; it never reads field values and skips identity, upload, demographic, hidden and search fields; the panel lists them and "Use" puts one in the generate panel's question box.
- 🧪 **Manual Test:** Open a Greenhouse application form, click the icon: the free-text questions are listed (not name, email or resume); "Use" fills the Question box.

#### `CAP-04`: Review Screen and Generate Wiring
- **Spec Section:** §4 Features 3 and 5 `[MUST]`
- **Size:** M
- **Status:** In review (PR pending)
- **Acceptance Criteria:** Detected questions become a checklist (free text ticked, choices not); each row is editable with its own max-characters limit, Generate and Remove; "Add question"; "Generate N answers" sends every ticked row with its limit and the captured job title, company and location; the job description is collapsed after a capture.
- 🧪 **Manual Test:** Capture a Greenhouse application form, untick one question, press "Generate N answers": each answer appears with its label and respects the limit; press a row's Generate to redo just that one.

#### `CAP-05`: Job-Site Access and Embedded Frames
- **Spec Section:** §2, §4 Feature 3 `[MUST]` (see ADR-0017)
- **Size:** M
- **Status:** In review (PR pending)
- **Acceptance Criteria:** A Settings switch allows a fixed list of popular job boards (never LinkedIn) in one click; other sites ask once; capture reads embedded frames and merges them; the injected reader refuses LinkedIn hosts in any frame; custom text widgets are detected by label.
- 🧪 **Manual Test:** Turn on "Capture on popular job sites"; on a Workday and an Oracle application page, and on a company page that embeds a Greenhouse form, click the icon: the questions of the form are listed.

#### `CAP-06`: Greenhouse Questions API
- **Spec Section:** §4 Feature 3 `[MUST]` (privacy note in `docs/LEGAL.md`)
- **Size:** S
- **Status:** Done (PR #36)
- **Acceptance Criteria:** On a Greenhouse job page, with the job-site permission on, capture also reads the board's public questions API and merges the custom questions and job details over the page result; any failure falls back silently; nothing is fetched without the permission, on other sites or on LinkedIn.
- 🧪 **Manual Test:** With the switch on, capture a Greenhouse application page: the questions match the form, including ones the page had not rendered yet. Turn the switch off: capture still works from the page alone.

#### `CAP-07`: Stale-Tab Banner
- **Spec Section:** §4 Feature 3 `[MUST]`
- **Size:** S
- **Status:** Done (PR #37)
- **Acceptance Criteria:** After a capture, switching tab or changing the page address (including single-page navigation, ignoring the hash) shows a dismissible banner "Capture this page"; nothing is read until that click; without an address the banner appears only for a different tab.
- 🧪 **Manual Test:** Capture a Greenhouse job, open another job in the same tab or another tab: the banner appears; click it: the panel fills with the new job and the banner goes. Switch back and forth on the same job: no banner. Dismiss hides it until the next capture.

#### `CAP-08`: Capture Docs and Hardening
- **Spec Section:** §2, §4 Feature 3, §5 (wording change proposed in ADR-0018; human edit)
- **Size:** S
- **Status:** In review (PR pending)
- **Acceptance Criteria:** README and HANDBOOK describe the final capture flow and its privacy surface; ADR-0018 holds the exact SPEC text; at most 12 embedded frames are merged (most questions first) and the question, structured-data and text caps are tested. The Playwright smoke test is deferred (an unpacked extension cannot be driven reliably in CI yet).
- 🧪 **Manual Test:** Read the README capture and privacy lines against what the extension does; capture a page with many iframes and check it stays quick.

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

#### `UX-01`: Panel Shell and Navigation
- **Spec Section:** §4 Feature 10 `[SHOULD]` (layout only)
- **Size:** M (2 sessions). Runs before `THEME-01a`; needs an ADR (bottom tabs vs left rail vs one scroll with anchors).
- **Status:** Done (PR #40). ADR-0019. Stepper and sticky primary action moved to `THEME-01b`: the buttons live inside `GeneratePanel`, and lifting them changes its logic.
- **Acceptance Criteria:**
  - Tab bar: Job, Jobs, You, Setup. Existing panels move into tabs with no change to their props or logic; every panel stays mounted (hidden) so a running generation survives a tab switch; Jobs shows an empty state until `HIST-01`.
  - Header relay dot pulses while checking or warming (solid under reduced motion).
  - Setup checklist (key, profile, resume) on the Job tab; only the key is marked as needed, matching today's rule that Generate appears once a key and the profile store exist.
  - Onboarding becomes two short cards (where data goes, training warning) using the `lib/privacy.ts` text; same stored flag.
  - Errors render in the scope of the failed action (onboarding, profile, setup). Tabs follow the ARIA tabs pattern with arrow-key navigation. Fluid from 320 px.
- 🧪 **Manual Test:** Load the unpacked extension, resize the panel narrow to wide, tab through it by keyboard, confirm every earlier panel is reachable and onboarding still blocks first use.
- **Required Tests:** Each tab renders its panels; onboarding gate; Generate disabled without key or profile; arrow-key tab navigation.
- **Plan:** `docs/research/panel-ux-and-visual-design.md`. Decisions taken: tabs, hand-rolled components (no Radix), Neon default, system font only, no mascot.

#### `THEME-01a`: Tokens, Presets and Base Components
- **Spec Section:** §4 Feature 10 `[SHOULD]`
- **Size:** M (2 sessions)
- **Status:** Done (PR #41). ADR-0020. Tailwind not used (tokens do not depend on it); Bubblegum is light; the extension first imports the package in `THEME-01b`.
- **Acceptance Criteria:**
  - `packages/ui` holds CSS custom-property tokens and Neon (default), Bubblegum and Brutal presets switched by `data-theme`; Bubblegum keeps dark ink text.
  - Hand-rolled `Button`, `Chip`, `StickerBadge`, `Card`, `Field`, `Switch`, `Tabs`, `EmptyState`.
  - A global `prefers-reduced-motion` block replaces the motion tokens and keyframes.
  - Verify the current Tailwind setup for WXT/Vite before using it; the tokens must not depend on it.
- **Required Tests:** Automated WCAG AA contrast test over every text and boundary pairing in every preset; snapshot tests per component and preset; every component keyframe has a reduced-motion override.

#### `THEME-01b`: Apply the Design to Screens
- **Spec Section:** §4 Feature 10 `[SHOULD]`
- **Size:** M (2 sessions)
- **Status:** In review (PR pending). ADR-0021.
- **Acceptance Criteria:**
  - Every screen follows the active preset: bare elements are restyled from tokens in one stylesheet; the tab bar, onboarding, checklist, Jobs, fit, answers and copy use the `@slayply/ui` components.
  - Fit chance is a sticker badge (level written in text). Each answer is a card; an answer with a character limit shows a ring plus the count and "over the limit" in text.
  - Receipts: each cited fact is a native expandable row (ID badge, then the fact text). Uncited claims keep the underline, the "no matching citation" label and Remove. Receipts are per answer; per-sentence chips are a follow-up.
  - Preset picker in Setup, stored in settings (not in the backup file, so `BACKUP_VERSION` is unchanged).
  - Moved from `UX-01`: a stepper (Capture, Fit, Answers) and a sticky primary action ("Check my fit", then "Write N answers", then "Write again"; "Stop" while running), rendered inside `GeneratePanel` so its logic is not lifted.
- 🧪 **Manual Test:** Load the unpacked extension. In Setup switch Neon, Bubblegum and Brutal and check every tab in each (text readable, focus ring visible). Capture a job: the stepper moves, the bottom button changes from Check my fit to Write answers and stays above the tab bar while scrolling. Run a fit check (sticker), write answers (cards, ring with a limit set, open a receipt), copy. Turn on OS reduced motion.
- **Required Tests:** Existing view tests unchanged and green (the expected settings object gains `preset`); `jobSteps`, `primaryAction`, `charStatus`, stored preset; render tests for stepper, action bar, ring, picker, cards, receipts and the fit sticker.

#### `THEME-01c`: Micro-interactions
- **Spec Section:** §4 Feature 10 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:** The catalogue in the plan section 6 (press, copy pop, step stamp, sticker drop, tab view-transition with feature detection, field shake, claim collapse), CSS only, `transform` and `opacity` only, each with a reduced-motion replacement. Confetti on "applied" stays `[LATER]`.
- 🧪 **Manual Test:** Toggle OS reduced motion and confirm no scaling or movement remains; copy an answer and check the "copied ✓" revert.
- **Required Tests:** `useCopyFeedback` revert timing; reduced-motion snapshot.

#### `THEME-01d`: Voice and Empty States
- **Spec Section:** §4 Feature 10 `[SHOULD]`
- **Size:** S (1 session)
- **Status:** Planned
- **Acceptance Criteria:** All copy in one `copy.ts`; playful text only on empty states, copy and loading; privacy, errors, keys and wipe stay plain. Empty states for Job, Jobs and You. Human reviews the copy.
- **Required Tests:** A test asserting no playful string appears in the serious-message list.

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
| **ADR-0009** | PDF Resume Parsing | Accepted | `pdf.js` in the side panel; reading order for one gutter; text only is stored | See `docs/adr/0009-pdf-resume-parsing.md` |
| **ADR-0010** | Claim Checker & Grounding | Accepted | Deterministic text-based check in core against the profile that was sent; exact claim match; flag when unsure | Trust model claims, resume `R` IDs (follow-up), LLM verifier pass |
| **ADR-0011** | OpenAI Adapter | Accepted | Chat Completions; chat models and effort support read from the model id; `supportsEffort` on `ModelInfo` | Responses API, hard-coded model table, always send effort |
| **ADR-0012** | Gemini Adapter | Accepted | Key in header; ends only on `STOP`; thinking budget (2.5) or level (3+) by model id; models ordered by version | Key in URL, trusting a partial stream, relying on the models `thinking` field |
| **ADR-0021** | Applying the Design to the Panel | Accepted | Global token stylesheet for legacy elements, components for rebuilt screens; stepper and action bar inside `GeneratePanel`; native `<details>` receipts | Rewrite every panel, lift handlers into `App`, per-sentence chips with state |
| **ADR-0020** | UI Package, Tokens and Base Components | Accepted | Source package; tokens in plain CSS parsed by the contrast test; hand-written `sl-*` classes | `tsc` build, tokens in TypeScript, Tailwind, CSS-in-JS |
| **ADR-0019** | Panel Shell and Navigation | Accepted | Bottom tab bar; all panels stay mounted and hidden; pure tab logic in `lib/panel-nav.ts` | Left icon rail, one scroll with anchors |
| **ADR-0013** | Direct Mode | Accepted | Optional host permission requested at toggle time; `direct` flag picks `streamDirect` in the existing controller; Claude only | Static host permission, a second controller |

---

## 6. Spec Change Proposals

*(Any future changes to `docs/SPEC.md` must be proposed and logged here with what it replaces, cost, and risk.)*

- **2026-10-30, approved by the maintainer (`PROV-04`):** §6 `GenerateRequest` gains optional `provider`, `model` and `effort`. *Replaces:* nothing (additive; requests without them are unchanged). *Cost:* one cached model-list call when a model is named. *Risk:* the model id is client text; mitigated by a shape check in the schema and a check against the provider's own model list in the relay (ADR-0014).

---

## 7. Recurring Maintenance Items

- **Monthly:** Run `pnpm update --interactive` for dependencies; verify pins in `docs/VERSIONS.md`.
- **Phase Grooming:** At the conclusion of each milestone, audit open bugs, review performance budgets, and groom next phase items.

---

## 8. Status Log

- **2026-10-30:** `THEME-01b` in review: the panel follows the chosen look (Neon, Bubblegum or Brutal, picked in Setup), has a Capture/Fit/Answers stepper and a bottom button for the next step, fit chance as a sticker, answers as cards with a character-limit ring, and citations as expandable receipts (ADR-0021). Look and sticky behaviour are manual-test only.

- **2026-10-30:** `THEME-01a` in review: `packages/ui` now has the design tokens, the Neon, Bubblegum and Brutal presets and eight base components, with an automated WCAG AA contrast test over every preset and reduced-motion rules for the CSS (ADR-0020). No screen uses it yet (`THEME-01b`).

- **2026-10-30:** `UX-01` in review: the side panel is now four tabs (Job, Jobs, You, Setup) with every panel kept mounted so work survives a tab switch, a setup checklist on the Job tab, two-card onboarding from the existing privacy text, errors shown where the action happened, and a relay dot that pulses (ADR-0019). Stepper and sticky action moved to `THEME-01b`. Tab clicks and keyboard movement are manual-test only.

- **2026-10-30:** Panel UX research and plan (`docs/research/panel-ux-and-visual-design.md`). `THEME-01` split into `UX-01` and `THEME-01a` to `d`; defaults chosen by the maintainer: four tabs, hand-rolled components, Neon default, system font, no mascot.

- **2026-10-30:** `PROV-04` in review: provider, model and effort picker. Spec change approved (§6 gains optional `provider`, `model`, `effort`); the relay checks provider against the key header and the model against the provider's list; one key per provider in the panel; Direct Mode stays Claude only (ADR-0014).
- **2026-10-30:** `DIRECT-01` in review: a Direct Mode switch in settings that calls Anthropic straight from the side panel with the user's key, skipping the relay; the browser asks for permission to reach api.anthropic.com only when it is turned on (ADR-0013). Claude only for now.
- **2026-10-30:** `PROV-03` in review: Gemini adapter (streamed, key in a header, incomplete replies are errors), text-model list, thinking effort mapped per model family and flagged for the UI; the relay serves all three providers and `GET /v1/models?provider=` already covered unknown-provider and missing-key cases (ADR-0012). Live-untested.
- **2026-10-29:** `PROV-02` in review: OpenAI adapter behind the provider interface (Chat Completions, streamed), chat-model list from `GET /v1/models`, reasoning effort mapped to `reasoning_effort` and flagged per model so the UI can hide it; the relay now serves OpenAI too (ADR-0011). The side panel still sends only the Anthropic key.
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
