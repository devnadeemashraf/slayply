# Slayply AI Handoff Pointer

## State
- Phase 0: Bootstrap completed.
- Git repository active with branch PR workflow.
- Monorepo tooling (pnpm + Turborepo + Biome) operational and verified.
- Doctor, handoff guard, and workspace test orchestration green across all packages.

## FIX-FIRST QUEUE
- None currently open.

## NEXT UP
- **Item:** `CORE-01` — Shared Schema & Core Types (`packages/core`).
- **Why now:** Relay (`apps/relay`) and Extension (`apps/extension`) depend on the shared request/response contract.
- **Where to start:** Create `packages/core/src/schema.ts` defining `GenerateRequest` and `GenerateResponse` schemas with Zod.
- **Done-when:** Zod schemas, TypeScript types, and validation helpers pass all unit tests and export cleanly from `packages/core`.

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
- PR #1 | `BOOT-01` | Finalize package skeleton, doctor checks, and Turborepo orchestration | Manual test: No
- PR #0 | `BOOT-00` | Initial repository scaffolding and docs | Manual test: No
