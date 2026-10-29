# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap completed.
- Git repository active with branch PR workflow.
- Monorepo tooling (pnpm + Turborepo + Biome) operational and verified.
- `pnpm run check` is now truthful: Biome failures fail the build (BP-001); hooks auto-install on `pnpm install`.

## FIX-FIRST QUEUE
- None currently open.

## NEXT UP
- **Item:** `CORE-02` — Stateless relay (`apps/relay`). Fix-first items above go before it.
- **Why now:** `@slayply/core` now exports the validated contract (CORE-01); the relay is its first consumer.
- **Where to start:** Hono app with `GET /health`; `POST /v1/generate` using `validateGenerateRequest` and `MAX_PAYLOAD_BYTES`. Decide the Node TS runner/bundler in an ADR first.
- **Done-when:** see `CORE-02` in `docs/ROADMAP.md`.

## Open questions for the human
- None blocking. Confirmed defaults: BUILD mode active, Render free tier for relay, WXT for Chrome Side Panel.

## Environment notes and gotchas
- Running on Windows OS (Node v24.21.0, pnpm 12.6.0). Pins live in `package.json`; `doctor` reads them.
- Biome also formats Markdown/YAML if included; `biome.json` deliberately excludes them (it would rewrite SPEC.md and the lockfile).
- Git autocrlf / eol configured to LF for code and CRLF for Windows scripts in `.gitattributes`.
- Always ignore `temp/` directory completely.
- Git push guards enforce no direct pushes to `main`.

## Learning
- Mode: BUILD (learning curriculum inactive).

## Recent history
- PR #10 | `BP-003` | Guard treats backslashes as path separators on every OS (CI caught it on Linux) | Manual test: No
- PR #8 | `BP-002` (rest) | CONTRIBUTING, SECURITY, Claude Code hooks/skills/subagents, hook-free checklists | Manual test: Yes
- PR #7 | `BP-002` (part) | Product README | Manual test: No
- PR #3 | `CORE-01` | Bounded strict request schema, tolerant response schema, shared validators, ADR-0002 | Manual test: No
- PR #2 | `BP-001` | Make check/lint/format truthful, wire hooks, harden doctor + handoff guard, CI frozen lockfile, LICENSE | Manual test: No
- PR #1 | `BOOT-01` | Finalize package skeleton, doctor checks, and Turborepo orchestration | Manual test: No
- PR #0 | `BOOT-00` | Initial repository scaffolding and docs | Manual test: No
