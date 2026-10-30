# ADR-0021: Applying the Design to the Panel

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `THEME-01b`

---

## Context and Problem Statement
`THEME-01a` produced tokens, presets and base components that no screen uses. `THEME-01b` has to apply them to about ten panels, add the stepper and sticky action moved out of `UX-01`, show fit chance as a sticker, show answers as cards with a character ring, and show citations as "receipts". Many panel tests pin exact text, and `GeneratePanel` owns the logic behind the Check fit and Generate buttons.

---

## Decision Drivers
- No change to panel logic or to what the existing tests pin.
- A preset must restyle every screen, including the ones not rebuilt here.
- Meaning must not depend on colour or motion.
- Panel memory (60 MB) and bundle (3.5 MB) budgets.

---

## Considered Options
**Restyling legacy panels**
1. **Restyle bare elements (inputs, buttons, tables, notices) from tokens in one global stylesheet; use `@slayply/ui` components where a screen is built or rebuilt.**
2. Rewrite every panel with the components.

**Sticky primary action**
1. **Render the stepper and action bar inside `GeneratePanel`, driven by pure functions (`jobSteps`, `primaryAction`).**
2. Lift Check fit and Generate into `App` and pass handlers down.

**Receipts**
1. **A native `<details>` per cited fact (ID badge as the summary), no new state.**
2. Chips beside each sentence with open/closed React state.

---

## Decision Outcome
- **Restyling:** option 1. One stylesheet moves all panels to the tokens with no behaviour change; components are used for the tab bar, onboarding, checklist, Jobs, fit, answers, copy and the preset picker. Rewriting the questionnaire, profile and resume panels would touch hundreds of lines and tests for no gain.
- **Sticky action:** option 1. The buttons keep using the handlers already in `GeneratePanel`. The bar is the last child of the panel, so `position: sticky` pins it above the tab bar only while the panel is on screen. "Write N answers" in the question list stays for generating one question or skipping the fit check.
- **Receipts:** option 1. Expanding and collapsing is the browser's own, keyboard-accessible, and the fact text stays in the markup, so existing tests that look for it still hold. A receipt is per answer, not per sentence; per-sentence chips can follow when sentences carry their own fact IDs in the UI.

### Details
- The preset is stored in settings (`preset`, default `neon`, unknown values fall back) and applied as `data-theme` on the page root. Settings are not part of the backup file, so `BACKUP_VERSION` is unchanged; a wipe resets it.
- The character ring always writes the count; over the limit it also says "over the limit". Tone never carries the meaning alone.
- The old `TabBar` and `nextTab` are replaced by the shared `Tabs`; the "stays mounted but hidden" test moved to the ui package with `TabPanel`.

### Negative Consequences / Trade-offs
- Legacy panels look consistent but are not rebuilt with components; that is a later cleanup if wanted.
- Sticky positioning and the look of three presets are manual-test only.
- The action bar offers "Check my fit" before "Write answers", so a user who wants to skip the fit check uses the question list button.

---

## Validation & Verification
Unit tests for `jobSteps`, `primaryAction`, `charStatus` and the stored preset; render tests for the stepper, action bar, ring, picker, answer cards, receipts and the fit sticker; existing view tests unchanged except that the expected settings object gains `preset: "neon"`. Manual test in the roadmap entry.
