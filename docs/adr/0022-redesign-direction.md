# ADR-0022: Redesign Direction

- **Status:** Proposed (accepted when the maintainer approves the prototype)
- **Date:** 2026-10-31
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `REDO-00`

---

## Context and Problem Statement
Using the production build with a real Gemini key showed a panel that scrolls too far, has no sense of hierarchy, gives no progress while a model works, needs a trip to Setup to change the model, and has no way to put an answer into the form or to rewrite it. The three theme presets, stickers and playful copy (ADR-0020, ADR-0021) also read as dated. The look should be simple, calm and the same on the site.

---

## Decision Drivers
- Fit the common case in one screenful.
- Keep every promise in the SPEC unless the maintainer changes it by hand.
- Keep tests that pin behaviour; remove only tests that pin the old look, and say which.
- Panel memory (60 MB) and bundle (3.5 MB) budgets.

---

## Considered Options
1. **Restyle in place:** keep the screens, replace the tokens. Cheapest, but it does not fix scrolling, progress or the model switch.
2. **Redesign structure and style in a sequence of small PRs, behind the existing logic** (chosen). A prototype is approved first; foundations, shell, indicator and model chip come before the Job tab restructure; new features (rewrite, fill, prefill) follow.
3. **Rewrite the panel from scratch.** Highest risk; discards 600+ component tests and tested logic.

---

## Decision
Option 2, in the order set out in `docs/REDESIGN_PLAN.md`:
- **Themes:** light, dark and follow-system only; one accent (`#0b5fff` light, `#7fa8ff` dark); dark background a greyish black (`#17181b`). The three presets and the preset picker go; a stored `settings.preset` is ignored. The site uses the same tokens.
- **Structure:** a fixed app bar, a content area, and a dock holding one primary action and the tabs. The Job tab becomes Capture, Questions, Answers.
- **Activity:** one component for every long task, driven by an explicit stage machine, showing the stage, time elapsed and Cancel. The relay sends a keep-alive event so a quiet stream is not dropped.
- **Model chip:** provider, model and effort in the app bar; Setup keeps keys, Direct Mode, theme and data.
- **New features** that change a SPEC promise (rewrite, click to fill, resume prefill) wait for the maintainer's hand edit of the SPEC; text is in the plan.

---

## Consequences
- Tests that pin the old look (the preset list, preset picker, per-preset token checks, sticker components) are removed in `REDO-01`, each named in that PR.
- Persistent settings stay readable: an old `preset` value is ignored, not an error.
- The prototype is throwaway; `packages/ui` is the source of truth once `REDO-01` lands.
- Click to fill is the one promise change that users will notice; it ships only after the SPEC, README, LEGAL, privacy page and store listing say so.
