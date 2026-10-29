---
name: handoff
description: Update POINTER, ROADMAP and HANDBOOK for the work just finished
disable-model-invocation: true
---

Bring the handoff docs in line with the current branch:

1. `docs/POINTER.md`: update State, FIX-FIRST QUEUE and NEXT UP, and add this PR to Recent history (keep the last 8). The file must stay at or under 80 lines with all required headings.
2. `docs/ROADMAP.md`: set the item's status and add a dated line to the Status Log.
3. `docs/HANDBOOK.md`: document any new module, flow or decision. Unbuilt sections stay marked `(planned, <ID>)`.
4. `docs/VERSIONS.md` and `docs/adr/` if dependencies or lasting decisions changed.

Finish with `pnpm run handoff:check`.
