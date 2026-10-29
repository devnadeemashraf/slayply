# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap completed.
- Git repository active with branch PR workflow.
- Monorepo tooling (pnpm + Turborepo + Biome) operational and verified.
- `pnpm run check` is now truthful: Biome failures fail the build (BP-001); hooks auto-install on `pnpm install`.

## FIX-FIRST QUEUE
- **BP-002** (docs/harness): add `README.md`, `CONTRIBUTING.md`, `SECURITY.md`; add the Claude Code harness the scaffold promised (`.claude/` hooks, `/next-pr` `/handoff` `/review` commands, reviewer and red-team subagents); renumber ADRs in `docs/ROADMAP.md` §5 (ADR-0002 is the shared schema, not WXT).

## NEXT UP
- **Item:** `CORE-01` — Shared Schema & Core Types (`packages/core`). Fix-first items above go before it.
- **Why now:** Relay (`apps/relay`) and Extension (`apps/extension`) depend on the shared request/response contract.
- **Where to start:** Create `packages/core/src/schema.ts` defining `GenerateRequest` and `GenerateResponse` schemas with Zod.
- **Done-when:** Zod schemas, TypeScript types, and validation helpers pass all unit tests and export cleanly from `packages/core`.

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
- PR #2 | `BP-001` | Make check/lint/format truthful, wire hooks, harden doctor + handoff guard, CI frozen lockfile, LICENSE | Manual test: No
- PR #1 | `BOOT-01` | Finalize package skeleton, doctor checks, and Turborepo orchestration | Manual test: No
- PR #0 | `BOOT-00` | Initial repository scaffolding and docs | Manual test: No
