# ADR-0019: Panel Shell and Navigation

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `UX-01`

---

## Context and Problem Statement
The side panel stacked every panel (capture, generate, resumes, questionnaire, profile, provider, settings) in one scroll. The task the user repeats (capture a job, check fit, copy answers) sat under setup screens they need once. `docs/research/panel-ux-and-visual-design.md` proposes navigation by purpose. The generate panel keeps a running generation, the job text, questions and unsaved edits in React state, so any navigation that unmounts it would lose work.

---

## Decision Drivers
- A switch of section must never drop a running generation or unsaved edits.
- Narrow, user-resizable panel (no documented width).
- Keyboard and screen-reader use (ARIA tabs pattern).
- Smallest change: existing panels keep their props and logic (`UX-01` is layout only).

---

## Considered Options
1. **Bottom tab bar** (Job, Jobs, You, Setup); every panel stays mounted, inactive ones are `hidden`.
2. **Left icon rail**, as one competitor uses.
3. **One scroll with a sticky jump bar** (anchors).

---

## Decision Outcome
Chosen Option: **1**, because a rail costs about 48 px of a narrow panel and needs icons we do not have, and anchors keep every setup screen between the user and the job. `hidden` (not unmounting) keeps state alive; the cost is that all panels' effects run at open, which they already did.

### Details
- Tab logic (`nextTab`, `setupChecklist`) is pure code in `lib/panel-nav.ts`.
- Failed storage actions show in the scope where they happened (onboarding, profile, setup), not in one global banner.
- The setup checklist treats only the API key as blocking, matching today's rule that generating needs a key and a loaded profile store; a profile and a resume are marked "makes answers better".
- Onboarding is two cards built from the existing `PRIVACY_STATEMENT` and `TRAINING_WARNING`; no new privacy wording.
- The relay dot pulses while checking or warming and is solid under `prefers-reduced-motion`.

### Positive Consequences
- The Job tab holds only the work loop; setup is one tap away and prompted by the checklist.
- No panel's props or logic changed, so their tests and POINTER manual-test notes still apply.

### Negative Consequences / Trade-offs
- Stepper and sticky primary action are not in this change: the buttons live inside `GeneratePanel`, and lifting them means changing its logic. They move to `THEME-01b`.
- The Jobs tab is an empty state until `HIST-01`.
- Tab clicks and keyboard focus movement are manual-test only (no DOM test environment in the repo).

---

## Validation & Verification
Unit tests for `nextTab` and `setupChecklist`; render tests for the tab bar (roles, selection, `aria-controls`), hidden-but-mounted panels, the checklist, onboarding cards and the Jobs empty state. Manual test in the unpacked extension (roadmap `UX-01`).
