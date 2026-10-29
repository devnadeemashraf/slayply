# ADR-0007: Context Pack Profile, Stable IDs and Local Storage

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `PROF-01`

---

## Context and Problem Statement
Answers must cite profile facts by ID (SPEC §4 Feature 1, `F01` / `S03`), and `VERIF-01` will later check those citations against history. So an ID must keep meaning the same thing. SPEC §3 and DEC-003 already choose IndexedDB through `idb`. The roadmap leaves four things open:

1. The markdown format of a context pack, and where it is parsed.
2. How IDs stay stable across re-imports and in-app edits.
3. Where "rules" go, since the request contract (`profile`) has no rules field.
4. How the profile is stored and tested without a browser.

---

## Considered Options
**Format**
1. **Heading-driven markdown (`## Facts`, `## Stories`, `## Preferences`, `## Rules`), hand-scanned in `packages/core`.**
2. YAML frontmatter plus bodies (needs a YAML dependency; hostile to hand-written notes).
3. Free-form text structured by an LLM (network at import time, not testable, may invent).

**Stable IDs**
1. **A persisted ledger: items keep their ID when their normalized text is unchanged; new items take a counter that only grows.**
2. IDs derived from a hash of the text (an edit changes the ID and breaks old citations).
3. IDs by position (a reorder or delete silently re-points old citations).

**Rules**
1. **Keep rules local and say they are not applied yet.**
2. Fold them into `prefs` under reserved keys (model-instructions-as-data, collides with real preferences, eats the 100-preference budget).
3. Add a `rules` field to the contract (correct long term, but a SPEC §6, core, prompt and relay change).

**Storage**
1. **One `profile` record in an `idb` database, validated on read and write.**
2. One record per item with indexes (nothing queries per item).
3. `chrome.storage.local` (contradicts DEC-003).

---

## Decision Outcome
- **Format:** option 1, documented in `docs/CONTEXT_PACK.md`. `parseContextPack` in `packages/core` never throws on content; it returns `warnings` with line numbers for anything it skipped (non-bullet lines in a section, over-long items, duplicates, preferences without `key: value`, items past the limits). Unknown sections and text before the first heading are ignored silently. A file over 1 MB is refused and a line over 10,000 characters is skipped unread. Headings are scanned, not matched by a regex, so a line of spaces cannot cause quadratic backtracking. A preference named `__proto__` is rejected with a warning.
- **IDs:** option 1. `reconcileProfile` matches by normalized text (NFKC, collapsed spacing, lower case), so a reorder or a formatting change keeps IDs. A changed wording is a new item with a new ID; the old ID is retired and never issued again, because `nextFact` / `nextStory` are persisted and checked on read to be above every issued ID. In-app edit keeps the ID (the user is editing that item); in-app delete retires it. IDs pass through `F99` to `F100`. An import that finds nothing is refused so it cannot wipe a profile.
- **Rules:** option 1. They are parsed, stored and shown with "Rules are saved but not yet applied to answers"; they are not sent to the model. The honest label matters more than an unreliable workaround. A later item should add them to the contract and render them as untrusted preferences that cannot override the grounding rule.
- **Storage:** option 1. A profile is at most about 600 items of 2 KB, always read and written whole, so one record gives an atomic replace. `openProfileDb` uses `onupgrade` so later stores (resumes, history) can be added by bumping the version. A record that fails `storedProfileSchema` raises `ProfileCorruptError` and is never overwritten by `save`; the panel blocks import, edit and generating until the profile has loaded, and only an explicit "discard" (which restarts IDs) removes an unreadable record. `save` checks and writes in one transaction and refuses (`StaleProfileError`) a copy whose ID counters are behind the stored ones, so a stale window cannot make a retired ID reusable. Edits in the panel run one at a time from the latest saved profile. Tests use `fake-indexeddb`, and the reconcile and edit logic is pure and tested without any database.
- **Scope:** import with a preview (counts and warnings) before saving, a viewer, inline edit, remove and add for facts and stories. Preferences and rules change only by re-import. No export, reordering, search or undo.
- **Request wiring:** `buildAnswerRequest` sends `toProfile(stored)` (facts, stories, preferences). The resume is still the no-resume marker until `RES-01`, and the panel says how many facts and stories an answer will use.

---

## Consequences
- An in-app edit that changes a fact's meaning keeps its ID, so older citations point at the new text. `VERIF-01` should check an answer against the facts in force when it was generated (store a snapshot or a hash of the cited text in history).
- Re-importing after rewording a fact retires its old ID. That is the safe direction.
- Rules do nothing yet; the label says so. Revisit with a contract change.
- `LIMITS.maxRules` (100) is a new core limit; SPEC §6 does not mention rules because they are not part of the contract yet.
- Profile text lives in IndexedDB unencrypted, like the API key in `chrome.storage.local` (SPEC §5: data stays in the browser).
- New dependencies: `idb` 8.0.4, and `fake-indexeddb` 6.2.6 for tests only.
