# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap completed.
- Git repository active with branch PR workflow.
- Monorepo tooling (pnpm + Turborepo + Biome) operational and verified.
- `pnpm run check` is now truthful: Biome failures fail the build (BP-001); hooks auto-install on `pnpm install`.
- Relay serves Claude for `/v1/generate` and `/v1/models` (`PROV-01`); OpenAI and Gemini still answer 501.
- `apps/extension` builds an MV3 side panel (WXT + React, ADR-0005) with the privacy gate, Anthropic key form and relay health status (`EXT-01`). With `GEN-01` it generates a draft answer from a pasted job description and question, validates it, and copies it (ADR-0006); answers are grounded in the saved profile (`PROF-01`) but have no resume text until `RES-01`.

## FIX-FIRST QUEUE
- None currently open.

## NEXT UP
- **Item:** `RES-01`: PDF Resume Upload & Parsing. Read its roadmap entry and SPEC §4 Feature 2 first. Check its size: PDF parsing (`pdf.js`) is a new dependency and a bundle-budget risk (3.5 MB), so verify the version in `docs/VERSIONS.md`, use the `architect` subagent and write an ADR (ADR-0008 is next free; renumber the planned `VERIF-01` row if needed).
- **Why now:** `PROF-01` landed the profile; `buildAnswerRequest` still sends the no-resume marker (`NO_RESUME_TEXT`) and `track: general`, `region: any`. `RES-01` should replace those with the chosen resume's text, track and region, and update `describeProfileUse`.
- **Carry into `RES-01`:** the profile DB is `slayply` (version 1, store `profile`); add a `resumes` store by bumping the version in `openProfileDb`'s `upgrade`, keyed by ID, and keep `oldVersion` checks. Resume text goes only in the request body, never logs.
- **Open from `PROF-01`:** rules are stored but not sent (a contract change plus prompt rendering as untrusted data is needed); `VERIF-01` must check citations against the fact text in force when an answer was generated (history should snapshot cited text or a hash), because an in-app edit keeps the ID; no export of the profile to markdown yet (`SET-01` covers export/import of data); preferences and rules change only by re-import; an unreadable profile record blocks the profile features until the user discards it (IDs restart); a window with older ID counters is refused (`StaleProfileError`) rather than merged; `profile-panel.tsx` has no automated tests (manual test only).
- **Open from `GEN-01`:** a reply that fails validation costs a second generation on the user's key (ADR-0006); revisit a relay `repair` field if repairs are common. The streaming preview shows only the first output's text. Direct Mode will use `generateValidated` instead. The panel cannot pick a model, tone or length yet (fixed `crisp` / `medium`). Click handling and the real clipboard are manual-test only.
- **Open from `EXT-01`:** the production relay URL is a build-time `WXT_RELAY_URL` (default `http://localhost:3000`) and needs setting at `SITE-01`; the Direct Mode offer is text only until `DIRECT-01`; the monitor stops after the 60 s give-up until the panel is reopened (a Retry button is deferred); a release build must set `WXT_RELEASE=1` and `WXT_RELAY_URL` (https); `generate-panel.tsx` and `App.tsx` have no automated tests (manual test only; `generation-view.tsx` is covered with `renderToString`); no extension icons yet.
- **Open from `PROV-01`:** key IPv6 clients on their /64 in the limiter and stream cap; `DIRECT-01` must test whether `anthropic-dangerous-direct-browser-access` is needed from an extension origin; `PROV-02` / `PROV-03` add adapters to `server.ts`; effort mapping is not built.
- **Done-when:** see `RES-01` in `docs/ROADMAP.md`.

## Open questions for the human
- None blocking. Confirmed defaults: BUILD mode active, Render free tier for relay, WXT for Chrome Side Panel.
- Repo settings to apply by hand (SETUP.md §4): squash-only merging, `check` as the required status, 0 required approvals, private vulnerability reporting.
- Unverified vendor facts to test before relying on them are marked in `docs/VERSIONS.md` (Render SSE/timeouts and bandwidth, Anthropic browser header).

## Environment notes and gotchas
- Running on Windows OS (Node v24.21.0, pnpm 12.6.0). Pins live in `package.json`; `doctor` reads them.
- Biome also formats Markdown/YAML if included; `biome.json` deliberately excludes them (it would rewrite SPEC.md and the lockfile).
- Git autocrlf / eol configured to LF for code and CRLF for Windows scripts in `.gitattributes`.
- Always ignore `temp/` directory completely.
- **Never stack PRs.** Branch every PR from up-to-date `main`. Stacked PRs merge into their parent branch and never reach `main` (this happened with #3, #7, #8).
- The agent guard checks the committed state: create the branch, commit and push first, then run `gh pr create`, each as a separate command.
- Large inline `node -` or heredoc scripts can fail to parse in this shell; write the script to a file and run it. Backslashes in inline strings get mangled, so use the Edit tool.
- After opening a PR, watch it with `gh pr checks --watch` before reporting success; CI runs on Linux and has caught bugs local Windows runs cannot.
- Optional cleanup: `stash@{0}` holds a superseded draft of CORE-01; run `git stash drop` when convenient.
- Git push guards enforce no direct pushes to `main`.

- Relay deploy (`SITE-01`) must set `TRUST_PROXY_HOPS` to the verified Render hop count and `EXTENSION_IDS`; the default of 0 puts all clients behind a proxy in one rate-limit bucket.
- Localhost origins are allowed in production too (SPEC §5 and the roadmap say so literally). Tighten only through a Spec change.

## Learning
- Mode: BUILD (learning curriculum inactive).

## Recent history
- PR #19 | `PROF-01` | Context pack import (preview first), `parseContextPack` / `reconcileProfile` in core with persisted never-reused `F01` / `S01` IDs, `idb` profile store, side-panel profile viewer with edit/add/remove, profile sent with generation requests; rules stored but not applied; ADR-0007, `docs/CONTEXT_PACK.md` | Manual test: Yes
- PR #18 | `GEN-01` | Side panel generation loop: JD + question form, SSE relay client, live draft preview from partial JSON, client-side validation with one re-request then labelled raw text, Copy with feedback; ADR-0006 | Manual test: Yes
- PR #17 | `EXT-01` | `apps/extension`: WXT + React MV3 side panel opened from the toolbar icon; settings store (Anthropic key, privacy acknowledgement) on `chrome.storage.local`; `/health` monitor with warm-up state and 60 s Direct Mode offer; ADR-0005 | Manual test: Yes
- PR #16 | `PROV-01` | `packages/providers`: shared adapter interface, Claude streaming adapter, cached model list, `generateValidated` (one repair retry, then raw text); relay serves Claude, `GET /v1/models`, stream deadline, per-IP open-stream cap, body timeout, API key charset check; ADR-0004 | Manual test: Yes
- PR #15 | `CORE-03` | Prompt builder: `buildPrompt` returns provider-neutral `{ system, messages }` with the SPEC §7 rules, ID-tagged facts, per-question `maxChars`, and forged-tag neutralisation | Manual test: No
- PR #14 | `CORE-02` | Stateless Hono relay: /health, /v1/generate SSE seam (501 until PROV-01), CORS allowlist, 500 KB cap, 60/min limiter, metadata-only logs, ADR-0003 | Manual test: Yes
- PR #13 | `BP-006` | Handoff cleanup: no-stacking rule, session gotchas, merged branches deleted | Manual test: No
- PR #12 | `BP-005` | Docs accuracy pass from independent audit; roadmap gaps filled (CORE-03, PROV split, SET-01, QA-01, REL-01) | Manual test: No
- PR #11 | `BP-004` | Guard no longer blocks reads of SPEC/lockfile/node_modules; edits still blocked | Manual test: No
- PR #10 | `BP-003` | Guard treats backslashes as path separators on every OS (CI caught it on Linux) | Manual test: No
- PR #9 | `BP-002` | Re-landed CORE-01, README and agent harness that stacked PRs never delivered to main | Manual test: Yes
