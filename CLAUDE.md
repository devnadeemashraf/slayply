# Claude Code Configuration & Agent Directives

> [!IMPORTANT]
> `AGENTS.md` is the single source of truth for all agent workflows, rules, and commands. Read `AGENTS.md` first.

## Session Startup
1. Read `docs/POINTER.md` (check FIX-FIRST QUEUE, then NEXT UP).
2. Adhere strictly to the PR Loop described in `AGENTS.md`.

## Slash Commands / Shortcuts
- `/next-pr`: Follows the PR Loop for the current `NEXT UP` roadmap item.
- `/handoff`: Updates `docs/POINTER.md`, `docs/ROADMAP.md`, and `docs/HANDBOOK.md`.
- `/review`: Executes self-review against `docs/CODING_STANDARDS.md`.
- `/check`: Runs `pnpm run check`.
