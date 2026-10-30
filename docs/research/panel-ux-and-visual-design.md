# Side panel UX and Gen-Z visual design: research and plan

- **Date:** 2026-10-30
- **Scope:** how the Slayply side panel should be organised, how it should look and feel (SPEC §4 Feature 10), and how to build it in small PRs. Nothing here changes behaviour or SPEC text; it proposes roadmap items for the human to accept.
- **Basis:** SPEC §2, §3, §4, §5; `apps/extension/src/entrypoints/sidepanel/App.tsx` and `style.css`; ROADMAP `THEME-01`; `docs/research/one-click-capture-ux.md`.
- Claims carry a URL. "Unverified" means no primary page states it. "Judgment" means a design call, not a finding.

---

## 1. Summary

**Problem.** `App.tsx` stacks ten panels in one scroll (capture, generate, resumes, questionnaire, profile, provider, settings, plus banners). `style.css` is 207 lines of unstyled browser defaults. The user's job (capture a page, check fit, get answers, copy them) is buried under setup screens they need once.

**Recommendation (judgment):**

1. **Organise around the job, not the data store.** Four tabs: **Job** (the loop), **Jobs** (saved log, `HIST-01`), **You** (profile, questionnaire, resumes), **Setup** (provider, key, privacy, data). Setup and You are visited rarely; Job is home.
2. **Make the Job tab a three-step flow** (Capture, Fit, Answers) with one sticky primary action at the bottom that always says what happens next.
3. **Treat the claim check as the signature feature.** Present citations as "receipts" (`F03` chips that expand to the source fact). It is the thing no autofill competitor shows and it suits the audience's "show me proof" instinct.
4. **Gen-Z look = dark-first, chunky, tactile, playful but legible:** thick borders, hard offset shadows, sticker badges, one loud accent, bouncy press feedback. Three presets (Neon, Bubblegum, Brutal) that differ only by tokens.
5. **Motion confirms; it never decorates.** Every animation answers a user action or a state change, uses `transform`/`opacity` only, and has a reduced-motion version.
6. **Playful in low-stakes moments, plain in serious ones.** Jokes on empty states and "copied"; none on privacy, errors, key handling or data wipe.

---

## 2. What the research found (and how much to trust it)

Honest limits: official Chrome docs say little about visual design, and the "Gen-Z design" literature is almost all agency and vendor blogs. Treat those as opinion. The accessibility and platform facts below are primary.

| Finding | Source | Weight |
|---|---|---|
| The panel is a "useful companion tool" that should avoid "unnecessary distractions". Users choose left or right placement. No width or height is specified, so the layout must be fluid. | [Chrome sidePanel reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) | Primary |
| Panels can be global or per-tab; the panel stays open across tab switches when configured so. Slayply is a global panel, so state must survive tab changes (it does today: panel memory plus IndexedDB). | same | Primary |
| Competitors converge on: open the side panel, run one action, **review every field before submitting**, read the page only on a user trigger. One vendor uses a left icon rail (Autofill, Cover Letter, Track). That rail is too wide for a narrow panel; bottom tabs fit better (judgment). | [SubmitX listing](https://chromewebstore.google.com/detail/submitx-autofill/mjlkkgpkekgjlgkogfmmljmjiafopcgd), [Careerflow help](https://help.careerflow.ai/en/articles/10008754-using-the-autofill-feature), [JobWizard guide](https://jobwizard.ai/blog/chrome-extension-for-job-application) | Vendor marketing; only the shared pattern is used |
| Review effort should go to risky answers (sponsorship, salary, EEO, free-text essays). Slayply already has this in the claim check and fit check; the UI should rank them first. | [JobWizard review post](https://jobwizard.ai/blog/autofill-extension-for-job-application-review-before-submit) | Vendor opinion |
| Neobrutalism = thick black borders, hard offset shadows, saturated flat colour, large plain type. Pairs with bouncy micro-interactions in "Gen-Z social app" patterns. | [onething.design](https://www.onething.design/blog/neo-brutalism-ui-design-trend), [superdesign](https://superdesign.dev/library/gen-z-social-app) | Descriptive only; "Gen Z prefers it" is unverified |
| `prefers-reduced-motion: reduce` means the user wants motion removed, reduced or replaced. Scaling and large-object movement are the named vestibular triggers, so **replace** scale pops with a fade or colour change rather than just shortening them. | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) | Primary |
| WCAG 2.2 SC 2.5.8 (AA): pointer targets at least 24x24 CSS px, with spacing, inline, equivalent, user-agent and essential exceptions. | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | Primary |
| View Transitions (`document.startViewTransition`, `view-transition-name`) are Baseline "newly available" since October 2025: native cross-fade and shared-element moves with no library. Exact Chrome version for the side panel is unverified; feature-detect. | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/view-transition-name) | Primary |

---

## 3. Information architecture

```
Header:   Slayply  ·····················  relay pulse (dot + "awake")
Body:     (active tab)
Footer:   sticky primary action  (Job tab only)
Tab bar:  [ Job ]  [ Jobs ]  [ You ]  [ Setup ]
```

| Tab | Holds (today's component) | Notes |
|---|---|---|
| **Job** | `capture-panel`, `fit-view`, `generate-panel`, `question-list`, `stale-banner` | Three-step flow, section 4 |
| **Jobs** | none yet (`HIST-01`) | Saved jobs with status chips; empty state until `HIST-01` |
| **You** | `profile-panel`, `questionnaire-panel`, `resumes-panel` | Sub-segments: Facts, Questionnaire, Resumes. Show a completeness meter ("profile 60% done") |
| **Setup** | `provider-panel`, `settings-panel`, privacy statement | Provider, key, Direct Mode, export/import, wipe |

Rules:

- **Setup checklist replaces the scroll of prerequisites.** The Job tab's empty state shows "3 things before your first answer: key, profile, a resume" with a progress ring; each item deep-links to the right tab. Generate stays disabled with a reason until the key and profile exist (it already gates on both in `App.tsx`).
- **Onboarding stays a blocking gate** (SPEC §3 requires plain privacy wording before first use) but becomes three short cards: what stays local, what leaves (and to whom), the training warning. One "I understand" at the end, same stored flag, same text from `lib/privacy.ts`.
- **Errors sit where the action was**, not in a global banner stack (`actionError` and `loadError` currently render at the top of the page).
- **Tab and step state persists** in memory only; no new storage.
- **Width:** design fluid from 320 px up; no fixed pixel layout. Exact min/max widths are unverified (the docs give none), so check in a real unpacked extension.

---

## 4. The Job tab: three steps

```
┌───────────────────────────────┐
│ Slayply            ● awake    │
├───────────────────────────────┤
│  ①Capture ─── ②Fit ─── ③Answers│   <- stepper, completed steps get a ✓ sticker
│                               │
│  Senior Engineer              │
│  Acme · Remote · $140-160k    │   <- editable chips, confidence dot per field
│  ▸ Job description (1,240 w)  │
│                               │
│  Questions (4)                │
│  ☑ Why Acme?            120ch │
│  ☑ Describe a project…  500ch │
│                               │
├───────────────────────────────┤
│ [   Check my fit  →   ]       │   <- sticky; becomes "Write 4 answers" after Fit
├───────────────────────────────┤
│  Job    Jobs    You    Setup  │
└───────────────────────────────┘
```

- **Capture:** empty state is one big "Capture this page" button plus the shortcut hint; "Paste instead" is a quiet link (per the capture research). The stale-tab banner (`CAP-07`) keeps its current rules and gets the new styling.
- **Fit:** chance becomes a **sticker badge** (high / medium / low) with a short reason; deal-breakers are red-bordered cards at the top; the match table becomes two columns of chips (they want / you have). Gaps are a collapsible list.
- **Answers:** one card per question; streaming text with a soft shimmer; claim check inline; **Copy** is the biggest button on the card. A character-limit ring fills as text approaches the limit.
- **Receipts (claim check):** each cited sentence carries an `F03` chip; tapping it expands the quoted fact underneath. An uncited claim keeps today's red underline plus a text label and a Remove button, so meaning never relies on colour alone.
- **Relay warm-up** (SPEC §5): the header dot pulses amber; the Job tab shows the lively "cooking your answer… ☕" state; after the 60 s give-up, the existing Direct Mode offer appears as a card, not a sentence.

---

## 5. Visual language

**Principles (judgment):** dark-first; one saturated accent per preset; flat colour, no gradients except one loading shimmer; 2 px borders; 10-14 px radius; hard offset shadows that "press flat" on click; sticker badges slightly rotated (1-2 degrees, static); generous spacing so a 320 px panel does not feel cramped.

### Tokens (CSS custom properties, set by `[data-theme]` on the root)

| Group | Tokens |
|---|---|
| Colour | `--bg`, `--surface`, `--surface-2`, `--ink`, `--ink-muted`, `--accent`, `--accent-ink`, `--ok`, `--warn`, `--bad`, `--border` |
| Shape | `--radius-sm/md/lg`, `--border-w`, `--shadow-offset`, `--shadow-color` |
| Type | `--font-ui`, `--font-display`, size scale 12/14/16/20/28 |
| Motion | `--dur-fast: 120ms`, `--dur-base: 200ms`, `--dur-slow: 320ms`, `--ease-out`, `--ease-pop` (slight overshoot cubic-bezier) |

### Presets

| Preset | Feel | Accent (starting point, to be tuned by contrast test) |
|---|---|---|
| **Neon** (default) | near-black base, electric lime or cyan accent | lime on `#0b0b10` |
| **Bubblegum** | light cream base, hot pink accent, ink-dark text | pink fills only; **text stays dark ink** because pastel-on-pastel fails contrast |
| **Brutal** | high-contrast black/white/yellow, heaviest borders and shadows | yellow with black ink |

Every pairing used for text must pass WCAG AA (4.5:1 normal text, 3:1 large text and UI boundaries). `THEME-01` already requires a contrast check; make it an automated test over the token table so a preset cannot ship failing.

### Typography

System font stack for body text (zero bytes). One bundled display face for headings and sticker badges only, if the human wants it: an extension cannot load Google Fonts under the MV3 default CSP, so it must be a self-hosted `woff2`, subset to Latin. Choose a face with an open licence and record it plus its size in `docs/VERSIONS.md`. Budget check: well under the 3.5 MB bundle limit for one subset file (exact size unverified until chosen).

### Components (`packages/ui`)

Build hand-rolled, headless-where-needed components, not a large library: `Button`, `IconButton`, `Chip`, `StickerBadge`, `Card`, `Tabs`, `Stepper`, `Switch`, `Field` (input/textarea with label and error), `Toast`, `EmptyState`, `ProgressRing`, `CopyButton`. SPEC says "shadcn-style"; shadcn is Radix plus Tailwind, which adds weight and runtime to a panel with a 60 MB memory budget. Proposal: keep the shadcn *pattern* (copy-in components, tokens, variants) but avoid the Radix dependency unless a component needs real focus management (Tabs and dialogs: implement the WAI-ARIA tab pattern by hand, it is small). **Needs a human decision**, see section 9.

### Copy and voice

Short, lowercase-friendly, a little cheeky, never cringe.

| Moment | Copy |
|---|---|
| Empty job | "No job yet. Open a posting and hit Capture." |
| Fit loading | "reading the fine print…" |
| Warm-up | "cooking your answer… ☕" (SPEC wording) |
| Copied | "copied ✓" |
| Uncited claim | "no receipt for this one" + Remove |
| Serious (privacy, wipe, key, errors) | Plain: "This deletes everything stored in this browser. Export first if you want a copy." |

---

## 6. Micro-interaction catalogue

All use `transform`/`opacity`/colour only. "RM" = what runs under `prefers-reduced-motion: reduce` (replace, not just shorten, per MDN).

| Interaction | Trigger | Motion | RM |
|---|---|---|---|
| Press | any button down/up | shadow offset collapses, element shifts by the same offset, 80 ms | colour change only |
| Copy pop | Copy clicked | button squashes, label swaps to "copied ✓", small sparkle burst (CSS pseudo-elements, 6 dots), reverts after 1.6 s | label swap and colour flash, no burst |
| Tab switch | tab bar click | view-transition cross-fade 150 ms; active indicator slides | instant swap |
| Step complete | Capture/Fit done | step dot fills, ✓ sticker stamps in with slight overshoot | ✓ appears, no scale |
| Sticker reveal | fit chance arrives | badge drops in and settles (translateY + 2° rotate) | fade in |
| Streaming | tokens arriving | text appears as it streams; soft shimmer on the card edge | static "writing…" label |
| Relay pulse | status = warming | dot opacity pulse 1.4 s | solid amber dot |
| Switch / chips | toggle, select | thumb slides 120 ms; chip scales 1.0 to 1.04 on hover only | colour change |
| Field error | validation fails | 2-cycle 4 px shake once | red border only |
| Character ring | typing near limit | ring fills; turns amber at 90%, red over | no animation of the fill |
| Remove claim | Remove clicked | sentence collapses (height + fade) 200 ms | instant removal |
| Confetti on "applied" | `[LATER]` per SPEC | not in scope; marked for after `HIST-01` | none |

Rules: nothing loops forever except the warm-up pulse and the generating shimmer; no motion on first paint of a screen the user did not trigger; durations 80-320 ms; a global `@media (prefers-reduced-motion: reduce)` block sets the `--dur-*` tokens to near zero and swaps the named keyframes. No animation library: CSS plus the View Transitions API (feature-detected, falls back to instant) keeps the bundle and memory flat. "Haptic-style" in SPEC is delivered visually (squash and settle); there is no haptics API to rely on in a desktop side panel.

---

## 7. Accessibility baseline

- Text 4.5:1, large text and control borders 3:1, in all three presets (automated).
- Targets at least 32 px high in practice; never below the 24 px SC 2.5.8 minimum.
- Visible `:focus-visible` ring (2 px accent, 2 px offset) on everything; logical tab order; the tab bar follows the ARIA tabs pattern with arrow-key navigation.
- State never relies on colour alone: chance badges have text, uncited claims have underline plus label, relay status has a text label (already true).
- Live regions: `role="status"` for relay and copied toasts, `role="alert"` for errors (already used).
- Reduced motion as in section 6; also respect `prefers-color-scheme` for the *default* preset (dark-first still), and `forced-colors` should not break borders (use real borders, not shadows alone, for boundaries).

---

## 8. Implementation plan (proposed roadmap items)

Each item is its own PR from `main`, per `AGENTS.md`. Sizes assume the roadmap's S/M scale. None touch SPEC text.

| ID | Size | What | Tests |
|---|---|---|---|
| **`UX-01`** Panel shell and navigation | M | Tab bar (Job, Jobs, You, Setup), header with relay pulse, move existing panels into tabs, setup checklist and 3-card onboarding, sticky action bar. **No visual styling beyond layout; no behaviour changes.** Needs an ADR (IA choice; compare bottom tabs vs left rail vs single scroll with anchors). | Component tests: each tab renders its panels; onboarding gate still blocks; generate stays disabled without key or profile; keyboard arrow navigation |
| **`THEME-01a`** Tokens, presets, base components | M | `packages/ui`: token CSS, three presets, `data-theme` switch, `Button`, `Chip`, `StickerBadge`, `Card`, `Field`, `Switch`, `Tabs`, `EmptyState`. Replaces the `echo skip` stubs. | Contrast test over every preset pairing; snapshot tests per component and preset (the roadmap's requirement); reduced-motion test asserting every `@keyframes` name used by components has an override |
| **`THEME-01b`** Apply to screens | M | Restyle Job, You and Setup using the components; stepper; fit stickers; receipts chips; answer cards; character ring. Preset picker in Setup (stored in settings; needs a settings field and a backup-schema check per the `SET-01` note). | Existing view tests keep passing; new tests for preset persistence and receipts expand/collapse |
| **`THEME-01c`** Micro-interactions | S | Catalogue in section 6: press, copy pop, step stamp, tab view-transition, shake, collapse. CSS plus a tiny `useCopyFeedback` hook. | Hook test for the 1.6 s revert; reduced-motion snapshot; manual checklist |
| **`THEME-01d`** Voice and empty states | S | Copy pass over every screen; empty states for Job, Jobs, You; fonts if approved. | Copy lives in one `copy.ts` so a test can assert no joke strings in the serious-message list |

Suggested order: `UX-01`, `THEME-01a`, `THEME-01b`, `THEME-01c`, `THEME-01d`, then `HIST-01` fills the Jobs tab. Alternatively do `HIST-01` and `GEN-02` first and let `UX-01` absorb them; the POINTER currently says `UX-01` goes before `THEME-01`.

**Budgets to hold:** extension under 3.5 MB (CI gate arrives with `QA-01`, so measure by hand each PR), panel under 60 MB, no new runtime dependency without a `docs/VERSIONS.md` row. Tailwind is *registry-verified only* in `VERSIONS.md` and the SPEC lists it; before `THEME-01a`, verify the current Tailwind setup for WXT/Vite against its docs. Plain CSS custom properties work without it, so tokens should not depend on Tailwind.

**Manual test (every item):** load the unpacked extension, resize the panel from narrowest to widest, switch Chrome light/dark and reduced-motion in OS settings, tab through the whole panel by keyboard, check all three presets.

---

## 9. Open decisions for the human

1. **Tabs (Job / Jobs / You / Setup) as the IA?** Alternative is keeping one scroll with a sticky section jump bar (less change, weaker focus).
2. **Components:** hand-rolled shadcn-style (recommended) or add Radix primitives (more a11y done for you, more bundle)?
3. **Default preset:** Neon dark (recommended, matches SPEC "dark-first, neon accent").
4. **Display font:** none (system only), or one bundled open-licence face for headings and stickers?
5. **Mascot or illustration** on empty states: skip for v1 (recommended) or commission one?
6. **Roadmap edit:** add `UX-01` and split `THEME-01` into a-d as above (ROADMAP is below SPEC in precedence, so this is a normal PR, not a Spec change).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Playful styling hurts readability or contrast | Contrast test is a CI gate; text on pastels stays dark ink |
| Motion costs memory or battery in a long-lived panel | Transform/opacity only, no loops except two, no library |
| Restructuring breaks the many "open from" manual-test notes in POINTER | `UX-01` moves components without changing their props or logic; keep each panel's test file untouched |
| Scope creep into features (history, templates) | Jobs tab ships as an empty state until `HIST-01` |
| Gen-Z styling reads as cringe | Playful only in low-stakes moments; one voice file; human reviews copy in `THEME-01d` |
