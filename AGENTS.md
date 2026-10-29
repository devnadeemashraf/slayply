# Slayply Agent Instructions & Execution Protocol

This document is the **single source of truth** for all contributors and coding agents working on Slayply. All tool-specific instructions (`CLAUDE.md`, `.cursor/rules/main.mdc`, `.github/copilot-instructions.md`) point to this file.

---

## 1. Session Read Order

At the beginning of every session, read files in this exact sequence:
1. `docs/POINTER.md` — Check `FIX-FIRST QUEUE` first. If empty, check `NEXT UP`.
2. `AGENTS.md` — Confirm ground rules and non-negotiable constraints.
3. The specific roadmap item in `docs/ROADMAP.md` matching `NEXT UP`.
4. The corresponding section of `docs/SPEC.md`.
5. Relevant sections of `docs/HANDBOOK.md` and `docs/CODING_STANDARDS.md`.

---

## 2. Hierarchy of Truth

When requirements appear ambiguous or conflict, resolve using this strict precedence:
`docs/SPEC.md` > `docs/ROADMAP.md` > `docs/POINTER.md` > `docs/HANDBOOK.md`

---

## 3. Non-Negotiable Rules

1. **Verify, Don't Recall:** Check official documentation or run CLI inspection commands before writing version numbers, APIs, or limits. Record entries in `docs/VERSIONS.md`. Never invent APIs.
2. **Day-One Green Builds:** Every configuration must parse and every script must have tests. If a module is not yet implemented, its task must print `"skip: <reason>"` and exit with status code 0.
3. **Zero Automated Web Actions:** Slayply will never auto-fill, auto-submit, or background scrape job boards. Respect LinkedIn terms.
4. **Small, Atomic PRs:** Every task must map to a single roadmap ID and fit in 1–4 working sessions.
5. **No Placeholders:** Never generate `"..."`, `"TODO: implement"`, or partial stubs in delivered files. Every delivered file must be complete.

---

## 4. Verify-Don't-Recall Reference Table

| Fact Category | What to Verify | Verification Source |
| :--- | :--- | :--- |
| **Node.js / pnpm** | Version flags, module syntax, workspace configs | `node --version`, `pnpm --version`, [pnpm.io](https://pnpm.io/) |
| **TypeScript / Turborepo** | Strict type flags, turbo pipeline schema | `turbo.json`, `tsconfig.json`, [turborepo.org](https://turbo.build/) |
| **Chrome Extensions** | Manifest V3 permissions, Side Panel API | [Chrome Developer Docs](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) |
| **Hono / Node Server** | SSE streaming, route parameters, context helpers | [Hono Documentation](https://hono.dev/) |
| **Render Web Services** | Free tier timeout, environment headers, blueprints | [Render Free Tier Docs](https://render.com/docs/free) |
| **Provider APIs** | Message payloads, reasoning effort params, streaming format | Anthropic, OpenAI, and Google AI documentation |

---

## 5. The PR Loop (Execute on Every Session)

1. **Orient:** Read `docs/POINTER.md`. If a bug is in `FIX-FIRST QUEUE`, address it immediately. Otherwise take `NEXT UP`. Read the roadmap entry and referenced spec sections.
2. **Check Versions:** Verify dependencies against `docs/VERSIONS.md`.
3. **Branch:** Create a branch from latest `main` (never from another unmerged branch; do not stack PRs): `<type>/<ID>-<slug>` (e.g. `feat/CORE-01-zod-schemas`).
4. **Design:** For M-sized items or changes to data schemas/security/hot paths, contrast 2–3 options and document in an ADR.
5. **Tests First:** Write happy, sad, edge, and malicious input test cases. Verify they fail.
6. **Implement:** Write minimal, idiomatic code satisfying `docs/CODING_STANDARDS.md`.
7. **Verify & Check:** Run `pnpm run check`. Never weaken or comment out a test to force a green build.
8. **Handle Bugs:** If an unrelated bug from an earlier PR is discovered, do not widen current scope. Add an entry `BP-xxx` with evidence to `docs/POINTER.md` (`FIX-FIRST QUEUE`).
9. **Review:** Perform a self-review against security, performance, and style guidelines.
10. **Update Documentation:** Update `docs/POINTER.md`, `docs/ROADMAP.md` status, `docs/HANDBOOK.md`, and `docs/VERSIONS.md` if touched.
11. **Commit & Push:** Commit using Conventional Commits (`feat(core): add Zod schema for generate request`). Push branch and open PR. **Never merge to main; the human reviews and merges.**
12. **Session Report:** Report back in at most 8 lines:
    - What changed
    - Test results
    - Manual test needed? (Yes/No with exact steps)
    - Risks
    - Next item

---

## 6. Workspace Commands

| Command | Action |
| :--- | :--- |
| `pnpm run doctor` | Validates the toolchain against the pins in `package.json` / `docs/VERSIONS.md` |
| `pnpm run check` | Everything CI runs: `doctor`, `handoff:check`, `fmt:check`, `lint`, `test`, `typecheck` |
| `pnpm run fmt` | Auto-formats workspace files via Biome |
| `pnpm run fmt:check` | Verifies formatting compliance without writing |
| `pnpm run lint` | Runs the Biome linter (fails on any finding) |
| `pnpm test` | Runs workspace test suite |
| `pnpm run handoff:check` | Validates `docs/POINTER.md`; in CI, code changes must update POINTER and new modules must update HANDBOOK |

---

## 7. The "Never" List

- **NEVER** commit directly to `main`.
- **NEVER** merge a PR; only the human merges.
- **NEVER** touch, inspect, or modify files in `temp/`.
- **NEVER** edit generated build files (`dist/`, `.output/`, `.wxt/`) or lockfiles manually.
- **NEVER** inspect, read, or print environment secrets or user API keys in terminal or logs.
- **NEVER** weaken, comment out, or delete a failing test to achieve a green build.
- **NEVER** leave a placeholder `TODO` without attaching a roadmap ID or issue tracker reference.

---

## 8. Checklists for Tools Without Hooks

Claude Code enforces some rules mechanically (`.claude/settings.json` → `scripts/claude-guard.mjs`). Other tools must follow them by hand.

**Before every edit**
- [ ] Not editing `docs/SPEC.md` (needs an approved Spec change proposal), `pnpm-lock.yaml`, `dist/`, `.output/`, `.wxt/` or `node_modules/`. Reading them is fine.
- [ ] Not reading or editing `temp/`, `.env*` (`.env.example` is allowed) or `*.pem`.

**Before every commit**
- [ ] Not on `main`. Branch is `<type>/<ID>-<slug>`.
- [ ] `pnpm run check` is green.
- [ ] `docs/POINTER.md` updated (and `docs/HANDBOOK.md` if a module was added).
- [ ] Commit subject follows Conventional Commits, and carries no tool or AI attribution.

**Before every push or PR**
- [ ] No force-push, and no push to `main`.
- [ ] Never merge. The maintainer merges.
