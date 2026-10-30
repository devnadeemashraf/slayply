# ADR-0020: UI Package, Tokens and Base Components

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `THEME-01a`

---

## Context and Problem Statement
`THEME-01a` needs a shared place for design tokens, three presets (Neon, Bubblegum, Brutal) and a few base components, with a contrast check that stops a preset shipping below WCAG AA. Three choices will last: how the package is delivered, where the tokens are the source of truth, and what styles the components.

---

## Decision Drivers
- Bundle under 3.5 MB and panel memory under 60 MB (SPEC §5).
- Tests run on Node with no browser (CODING_STANDARDS §3).
- The contrast test must test what ships, not a copy.
- `THEME-01b` restyles the screens next, so the API should be small and easy to change.

---

## Considered Options
**Delivery**
1. **Source package:** `exports` point at `src/*.ts` and the CSS files; the extension's Vite build compiles them. No build step.
2. `tsc` build to `dist/` like `core` and `providers`.

**Token source of truth**
1. **Plain CSS custom properties in `theme.css`; the test parses that file.**
2. Tokens as a TypeScript object, with the CSS generated from it.

**Component styling**
1. **Hand-written CSS classes (`sl-*`) in `components.css` that read only tokens.**
2. Tailwind utility classes (SPEC §3 names Tailwind).
3. CSS-in-JS.

---

## Decision Outcome
- **Delivery:** option 1. `tsc` does not copy CSS, the relay does not need this package (it is extension-only), and a trial build confirmed Vite bundles it with one copy of React (extension 2.18 MB to 2.19 MB with every component imported).
- **Tokens:** option 1. Generated CSS would be a build artifact to keep in step; parsing the shipped file means a failing preset cannot hide.
- **Styling:** option 1. Tokens must not depend on Tailwind, and `docs/VERSIONS.md` lists it as registry-verified only with nothing using it. **This leaves SPEC §3's mention of Tailwind unused for now; adopting it later does not require changing these tokens.** Raised with the maintainer in the PR.

### Details
- Presets switch by `data-theme` on any element; no attribute means Neon. A `prefers-reduced-motion` block collapses the three duration tokens, and the test fails if a component hard-codes a duration or leaves a `@keyframes` without a reduced-motion rule.
- Bubblegum is a light preset (dark ink on pastel fills). The roadmap text says "dark presets"; a pastel preset is the point of Bubblegum, so it is the exception. A separate `--focus` token keeps the focus ring at 3:1 where the pink accent cannot.
- Components: `Button`, `Chip`, `StickerBadge`, `Card`, `Field`, `Switch`, `Tabs`/`TabPanel`, `EmptyState`. All render escaped text, give controls real labels and roles, and keep meaning in text, not colour.
- The package is not used by the extension yet. `THEME-01b` adds the dependency and applies it, which changes how the panel looks, so it needs its own manual test.

### Positive Consequences
- One file defines each preset; one test guards 13 contrast pairs in each of 3 presets and records the token values.
- No new runtime dependency.

### Negative Consequences / Trade-offs
- Snapshot tests cover markup and token values, not pixels; the look is a manual test in `THEME-01b`.
- The extension's `TabBar` stays separate until `THEME-01b` replaces it with `Tabs`.

---

## Validation & Verification
76 tests: contrast maths against known values, every preset defines every token and passes every pair, token snapshots, reduced-motion rules, and render and snapshot tests for each component including hostile text. A deliberate change to a Bubblegum colour made the contrast and snapshot tests fail.
