# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap in progress.
- Git repository initialized on `main`.
- Monorepo tooling (pnpm + Turborepo + Biome) scaffolded.
- Full `check` command operational and green across workspace skeleton.

## FIX-FIRST QUEUE
- None currently open.

## NEXT UP
- **Item:** `BOOT-01` — Finalize package skeleton and wire root scripts.
- **Why now:** Foundation must pass all checks and prove the AI PR loop before building `packages/core`.
- **Where to start:** Run `pnpm run check` and verify `scripts/doctor.mjs` and `scripts/handoff-check.mjs`.
- **Done-when:** All workspaces resolve dependencies and root `pnpm run check` passes with 0 exit code.

## Open questions for the human
- None blocking. Confirmed defaults: BUILD mode active, Render free tier for relay, WXT for Chrome Side Panel.

## Environment notes and gotchas
- Running on Windows OS (Node v24.21.0, pnpm 12.6.0).
- Git autocrlf / eol configured to LF for code and CRLF for Windows scripts in `.gitattributes`.
- Always ignore `temp/` directory completely.
- Git push guards enforce no direct pushes to `main`.

## Learning
- Mode: BUILD (learning curriculum inactive).

## Recent history
- PR #0 | `BOOT-00` | Initial repository scaffolding and docs | Manual test: No
