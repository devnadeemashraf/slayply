---
name: next-pr
description: Run the PR loop for the current NEXT UP roadmap item
disable-model-invocation: true
argument-hint: [roadmap-id]
---

Run the PR loop in `AGENTS.md` section 5 for `$ARGUMENTS`, or for the item under NEXT UP in `docs/POINTER.md` when no ID is given.

1. Read `docs/POINTER.md`. If FIX-FIRST QUEUE has an entry, do that first.
2. Read the roadmap entry, the spec sections it cites, and the matching `docs/HANDBOOK.md` sections.
3. Branch from up-to-date `main` as `<type>/<ID>-<slug>`.
4. For M items or anything touching the data model, security or hot paths, compare two or three approaches (use the `architect` subagent) and write an ADR if the choice will last.
5. Write tests first (happy, sad, edge, abuse) and watch them fail.
6. Implement the smallest change that passes, following `docs/CODING_STANDARDS.md`.
7. Run `pnpm run check` until green. Never weaken a test.
8. Log unrelated earlier bugs as `BP-xxx` in POINTER instead of widening scope.
9. Run the `reviewer` subagent on the diff and fix what it finds.
10. Run `/handoff`, commit with Conventional Commits, push, open the PR. Never merge.
11. Report in at most 8 lines: what changed, test results, manual test needed (exact steps), risks, next item.
