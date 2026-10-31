# Redesign Plan (Phase 6)

Status: **R0 in review.** Approved defaults: indigo accent, light and dark themes only, playful copy kept only in empty states, prototype first.

The prototype is `docs/design/prototype/index.html` (open it in a browser; it has every screen in light and dark). Screenshots are in `docs/design/screens/`.

## Why

Found by using the production build with a real Gemini key:

| Problem | Cause today | Fix |
| :-- | :-- | :-- |
| Long scrolls, no hierarchy | The Job tab stacks capture, job text, questions, fit check, answers and save | A 3-step flow with one primary action in a sticky dock; details in drawers |
| No progress while waiting | One line of loading text; the relay is silent while a model thinks | One app-wide activity indicator: stage, time elapsed, Cancel |
| Switching model needs the Setup tab | Picker lives in Setup | Provider, model and effort chip in the app bar |
| Answers are copied by hand | No fill | Per-answer Fill button |
| No rewrite | Only whole-draft Shorter and Longer | Improve, Make it sound more natural, Shorter, Longer, custom instruction, with undo |
| Dated look | 3 presets, stickers, playful copy | One light and one dark theme, one accent, shared with the site |

## Design rules

- One purpose per screen; one primary button, always in the dock.
- Details open in drawers or popovers; a screen should fit in about 720 px without scrolling for the common case.
- Colour: light (white, `#0b5fff` accent), dark (greyish black `#17181b`, `#7fa8ff` accent). Status colours only for status (ok, warn, bad). Meaning never depends on colour alone.
- Motion is small (press, copy, popover, step change) and every motion has a reduced-motion rule and a test.
- Plain copy everywhere except empty states.

## PR sequence

Each PR branches from up-to-date `main`, has tests, and is manually testable. Sizes: S one session, M two, L three or more.

| ID | PR | Size | Notes |
| :-- | :-- | :-- | :-- |
| REDO-00 | Plan, prototype, ADR-0022 | S | This PR. No app change. Maintainer approves the look. |
| REDO-01 | Theme foundation | M | Light, dark, auto; one accent; remove the 3 presets (stored `preset` ignored); `packages/ui` tokens shared with `apps/site`; contrast tests kept. Supersedes ADR-0020/0021 parts. |
| REDO-02 | New shell | M | App bar (brand, model chip slot, theme toggle, relay status), restyled tabs, sticky dock, section/drawer/popover primitives. |
| REDO-03 | Activity indicator | M | `ActivityIndicator` fed by an explicit stage machine in the generate controller (connecting, waiting, writing, checking, second attempt) with elapsed time and Cancel; relay keep-alive event; slow-run note after 30 s. Replaces `PLAYFUL.fitLoading` and `draftLoading`. Gives real timings for the slow fit check. |
| REDO-04 | Model and effort chip | S | Popover in the app bar; Setup keeps keys and data. Direct Mode ignores the choice (existing rule). |
| REDO-05 | Job tab restructure | L | Capture, Questions, Answers steps; job text in a drawer; compact question rows; fit check as summary card plus drawer; answer cards collapse. |
| REDO-06 | Answer actions | M | Copy, Improve, More natural, Shorter, Longer, custom; version history with undo; claims re-checked after each rewrite. **Needs SPEC change A.** |
| REDO-07 | Click to fill | M | Fill one answer into one field on click; never submits; never on LinkedIn; undo. **Needs SPEC change B**, LEGAL and store-listing text. |
| REDO-08 | You tab and resume prefill | L | Review list of suggested facts from the resume (accept, edit, reject); compact questionnaire steps. **Needs SPEC change C.** |
| REDO-09 | Jobs, Setup and motion polish | M | Restyle remaining screens, empty states, one micro-interaction pass, trim playful copy to empty states. |
| REDO-10 | Site and release | S | Site uses the same tokens, README screenshots, store screenshots, rerun `docs/DEPLOYMENT.md`. |

Order: 00, 01, 02, then 03 and 04, then 05; after 05, 06, 07 and 08 in any order; then 09, 10.

## Proposed SPEC changes (for the maintainer to apply by hand; logged in ROADMAP §6)

**A. Rewrite request (REDO-06).** `GenerateRequest` gains an optional `revise` object: `{ outputId, text, instruction }` where `instruction` is `improve`, `natural`, `shorter`, `longer` or `custom` (with a short custom string). The reply is validated like any answer (claims must cite facts). *Replaces:* nothing (additive). *Cost:* a schema, prompt and relay validation change. *Risk:* a rewrite could drop or invent claims; mitigated because the claim checker runs on the result.

**B. Click to fill (REDO-07).** §2 "Never automated" currently says Slayply never writes into the page. Proposed: "Slayply writes into a page only when the user clicks Fill on one answer, and then only into the one field that answer belongs to. It never submits a form, never clicks, never runs on LinkedIn, and the user can undo." *Replaces:* the "never writes into the page" sentence in §2, the README principle table, `docs/LEGAL.md` and the privacy page. *Cost:* field locators recorded at capture, a fill routine, tests on fixtures. *Risk:* script-rendered pages ignore plain value changes; mitigated with native setters and input events, proven on Greenhouse, Lever and Ashby fixtures and live forms. The `scripting` permission is already declared; the store listing text needs a line for writing.

**C. Resume prefill (REDO-08).** A new request kind that sends resume text and returns suggested facts with source lines. *Replaces:* nothing (additive). *Cost:* a schema and prompt. *Risk:* the model could invent a fact; mitigated because nothing is saved until the user accepts each suggestion and every suggestion shows its source line.

## Definition of done for the whole redesign

- No screen needs more than one screenful of scrolling for the common case (checked at 390 x 720).
- Every long task shows stage and elapsed time.
- Model and effort change without leaving the Job tab.
- A Fill and a rewrite work on a real form with a real key (manual test, recorded in `docs/VERSIONS.md`).
- Light and dark pass the contrast test; reduced-motion test passes for every animation.
- `pnpm run check` green; bundle under 3.5 MB; deployment handbook rerun.
