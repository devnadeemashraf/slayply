# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap completed.
- Git repository active with branch PR workflow.
- Monorepo tooling (pnpm + Turborepo + Biome) operational and verified.
- `pnpm run check` is now truthful: Biome failures fail the build (BP-001); hooks auto-install on `pnpm install`.

## FIX-FIRST QUEUE
- None currently open.

## NEXT UP
- **Item:** `CORE-03` — Prompt builder in `packages/core`. Fix-first items above go before it.
- **Why now:** `CORE-02` landed the relay and its `ProviderAdapter` seam; `CORE-03` produces the provider-neutral messages that `PROV-01` (Claude adapter) will send.
- **Where to start:** read SPEC §7 and the `CORE-03` roadmap entry. Test-first, including the prompt-injection probe.
- **Carry into `PROV-01`:** wire real adapters into `apps/relay/src/server.ts` (it passes `providers: {}`, so `/v1/generate` returns 501); add a stream deadline, a per-IP open-stream cap and a body-read timeout (ADR-0003); decide whether `ProviderAdapter` moves to a shared package; build `GET /v1/models`.
- **Done-when:** see `CORE-03` in `docs/ROADMAP.md`.

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
- PR #14 | `CORE-02` | Stateless Hono relay: /health, /v1/generate SSE seam (501 until PROV-01), CORS allowlist, 500 KB cap, 60/min limiter, metadata-only logs, ADR-0003 | Manual test: Yes
- PR #13 | `BP-006` | Handoff cleanup: no-stacking rule, session gotchas, merged branches deleted | Manual test: No
- PR #12 | `BP-005` | Docs accuracy pass from independent audit; roadmap gaps filled (CORE-03, PROV split, SET-01, QA-01, REL-01) | Manual test: No
- PR #11 | `BP-004` | Guard no longer blocks reads of SPEC/lockfile/node_modules; edits still blocked | Manual test: No
- PR #10 | `BP-003` | Guard treats backslashes as path separators on every OS (CI caught it on Linux) | Manual test: No
- PR #9 | `BP-002` | Re-landed CORE-01, README and agent harness that stacked PRs never delivered to main | Manual test: Yes
- PR #8 | `BP-002` (rest) | CONTRIBUTING, SECURITY, Claude Code hooks/skills/subagents (merged into stacked branch) | Manual test: Yes
- PR #3 / #9 | `CORE-01` | Bounded strict request schema, tolerant response schema, shared validators, ADR-0002 (reviewed in #3, delivered to main by #9) | Manual test: No
- PR #2 | `BP-001` | Make check/lint/format truthful, wire hooks, harden doctor + handoff guard, CI frozen lockfile, LICENSE | Manual test: No
