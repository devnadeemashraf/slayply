# ADR-0001: Monorepo Structure & Tooling Architecture

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `BOOT-01`

---

## Context and Problem Statement
Slayply consists of multiple distinct packages and applications:
1. `apps/extension`: A Chrome Side Panel Manifest V3 extension.
2. `apps/relay`: A stateless Hono HTTP server running on Node.js / Render.
3. `apps/site`: A static landing page and privacy policy on Render.
4. `packages/core`: Shared Zod validation schemas, types, and claim checking logic.
5. `packages/providers`: LLM provider adapters (Claude, OpenAI, Gemini).
6. `packages/ui`: Shared UI components and Gen-Z design tokens.

We need a monorepo setup that provides ultra-fast package management, strict shared TypeScript typing, minimal build overhead, and fast linting/formatting across Windows and Linux.

---

## Decision Drivers
- Immediate code-sharing between `apps/extension`, `apps/relay`, and `packages/core`.
- Zero-drift TypeScript type safety across client and server.
- High performance on Windows development workstations.
- Blazing fast linting and formatting without maintenance sprawl.

---

## Considered Options
1. **Option 1 (Chosen):** `pnpm` workspaces + Turborepo + Biome.
2. **Option 2:** `npm` workspaces + Nx + ESLint / Prettier.
3. **Option 3:** Polyrepo with published private npm packages.

---

## Decision Outcome
Chosen Option: **Option 1 (pnpm workspaces + Turborepo + Biome)**.

### Positive Consequences
- **Instant symlinking:** `pnpm` workspace protocol (`workspace:*`) enables immediate sharing of `packages/core` without intermediate compilation steps during development.
- **Turborepo caching:** `turbo` caches build, lint, and test tasks across workspaces.
- **Biome performance:** Single Rust binary replaces both ESLint and Prettier, formatting and linting files in milliseconds with zero configuration friction.
- **Strict isolation:** pnpm's content-addressable storage prevents ghost dependencies.

### Negative Consequences / Trade-offs
- Developers must have `pnpm` installed globally or invoke it via `corepack`.
- Biome has fewer plugin ecosystems than legacy ESLint, but natively covers all necessary TypeScript, JSON, and CSS rules for our stack.

---

## Validation & Verification
- `pnpm install` links internal packages cleanly.
- `pnpm run check` runs Turborepo pipeline and completes with 0 exit code across empty skeleton.
- Verified on Windows Node v24.21.0 and pnpm 12.6.0.
