# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap completed.
- Git repository active with branch PR workflow.
- Monorepo tooling (pnpm + Turborepo + Biome) operational and verified.
- `pnpm run check` is now truthful: Biome failures fail the build (BP-001); hooks auto-install on `pnpm install`.
- Relay serves Claude for `/v1/generate` and `/v1/models` (`PROV-01`); OpenAI and Gemini still answer 501.

## FIX-FIRST QUEUE
- None currently open.

## NEXT UP
- **Item:** `GEN-01`: Basic Answer Generation Loop. Read its roadmap entry and SPEC §4 Feature 5 first. M-sized: use the `architect` subagent.
- **Why now:** `PROV-01` landed the Claude adapter, `generateValidated` and the relay wiring; `GEN-01` is the first consumer.
- **Carry into `GEN-01`:** `generateValidated` streams only the first attempt to `onDelta`; if it fails validation the UI must replace the shown text with the repaired reply (emit a "retrying" state). The relay streams raw text and never retries (ADR-0004), so a relay-mode client validates and retries itself. `GenerateRequest` has no model field, so the adapter uses the newest listed model; user model choice is a contract change.
- **Open from `PROV-01`:** key IPv6 clients on their /64 in the limiter and stream cap; `DIRECT-01` must test whether `anthropic-dangerous-direct-browser-access` is needed from an extension origin; `PROV-02` / `PROV-03` add adapters to `server.ts`; effort mapping is not built.
- **Done-when:** see `GEN-01` in `docs/ROADMAP.md`.

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
- PR #16 | `PROV-01` | `packages/providers`: shared adapter interface, Claude streaming adapter, cached model list, `generateValidated` (one repair retry, then raw text); relay serves Claude, `GET /v1/models`, stream deadline, per-IP open-stream cap, body timeout, API key charset check; ADR-0004 | Manual test: Yes
- PR #15 | `CORE-03` | Prompt builder: `buildPrompt` returns provider-neutral `{ system, messages }` with the SPEC §7 rules, ID-tagged facts, per-question `maxChars`, and forged-tag neutralisation | Manual test: No
- PR #14 | `CORE-02` | Stateless Hono relay: /health, /v1/generate SSE seam (501 until PROV-01), CORS allowlist, 500 KB cap, 60/min limiter, metadata-only logs, ADR-0003 | Manual test: Yes
- PR #13 | `BP-006` | Handoff cleanup: no-stacking rule, session gotchas, merged branches deleted | Manual test: No
- PR #12 | `BP-005` | Docs accuracy pass from independent audit; roadmap gaps filled (CORE-03, PROV split, SET-01, QA-01, REL-01) | Manual test: No
- PR #11 | `BP-004` | Guard no longer blocks reads of SPEC/lockfile/node_modules; edits still blocked | Manual test: No
- PR #10 | `BP-003` | Guard treats backslashes as path separators on every OS (CI caught it on Linux) | Manual test: No
- PR #9 | `BP-002` | Re-landed CORE-01, README and agent harness that stacked PRs never delivered to main | Manual test: Yes
