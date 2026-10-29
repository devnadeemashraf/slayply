# One-click capture: UX redesign research

- **Date:** 2026-10-30
- **Scope:** replace the multi-step capture flow (context menu, panel buttons, paste box) with one gesture that fills the side panel with the JD, the application questions and the job fields, then lets the user review and generate.
- **Basis:** SPEC §1, §2, §4 (Feature 3), §5; ADR-0015; the `CAP-01` code. Note: ADR-0015 and the capture code are on branch `feat/CAP-01-selection-job-capture`, not on `main` at the time of writing (`docs/POINTER.md` lists CAP-01 as NEXT UP). Everything below about "what exists" was read from that branch.
- Claims carry a URL. "Unverified" means no primary page states it; it needs a test in a real unpacked extension.

---

## 1. Summary and recommended design

The current flow is: capture (menu or button) -> staged draft -> pick a kind (JD / Question / Note) -> "Use" -> repeat for each question -> go to the generate panel. A job application needs at least three round trips (JD, each question, job fields). The friction is the model (the user assembles the job piece by piece), not the polish.

**Recommendation: one "capture the whole page" gesture that produces one structured Job Draft, shown on one review screen.**

Exact click path (Greenhouse/Lever/Ashby page, user is on it):

1. **Click the Slayply toolbar icon (or press the keyboard shortcut).** The panel opens and, from that same gesture, one read of the active tab runs: JD text, `JobPosting` JSON-LD, page title, and the visible form-field labels (the questions).
2. **Review** the single Job Draft screen: editable title / company / location / salary (confidence-marked), the JD (collapsed, editable), and the detected questions as a checklist (editable, add/remove).
3. **Click "Generate"** (all checked questions) or a per-question generate button. The Fit check can start from the same click.

That is **2 clicks** from a job page to the first draft (icon, Generate), versus roughly 6 to 10 today.

Other rules:

- **Selection-aware:** if text is selected when capture is triggered, the selection is used as the JD (or relabelled as a question in review) instead of the page. This is the only way LinkedIn works.
- **LinkedIn:** never read the page. An icon click on a LinkedIn tab reads only the user's selection (ADR-0015 already allows a selection everywhere). With no selection the panel says "Select the job text, then click the icon again." Keep the right-click "Capture for Slayply" item, which needs no script because `info.selectionText` carries the text.
- **Paste box** becomes a collapsed "Paste instead" link in the empty state, not a primary control.
- **No new standing permission** in the base design: `activeTab` + `scripting` (already in the CAP-01 manifest). An optional one-time grant for known ATS hosts (option f) is an add-on that fixes the iframe problem and the "click the icon again after switching tabs" problem.
- **Capture never triggers generation.** Capture fills the panel; sending anything to a model is a separate explicit click (SPEC §5 privacy statement).

---

## 2. Options compared

Clicks = user actions from a job page to a populated review screen (not counting Generate).

| Option | Clicks | Reliability | Permission cost | Spec fit | LinkedIn | Verdict |
|---|---|---|---|---|---|---|
| (a) "Capture this page" button in the panel | 2 (open panel, press) | Mixed: needs `activeTab` for that tab, and a panel button is not a documented grant gesture, so on an un-invoked tab it fails (today's error message) | `activeTab` only | Good: explicit press | Selection only | Keep as in-panel re-capture / fallback |
| (b) Icon click auto-captures, panel opens | 1 | Good on the top document; iframes unverified | `activeTab` (no install warning) | Good once the wording is clarified (section 5) | Selection only | **Primary path** |
| (c) Keyboard shortcut (commands) | 0 mouse, 1 key | Same as (b) | `activeTab`; user-remappable; max 4 suggested keys | Good | Selection only | Secondary entry to (b) |
| (d) Selection-aware hybrid | same | Good (most precise input) | none | Good | The only LinkedIn path | **Required** inside (a)-(c) |
| (e) Per-ATS adapters vs generic extraction | n/a | Generic: portable, medium accuracy. Adapters: precise but rot with markup changes | none (Greenhouse API adds a host permission) | Good | n/a | **Generic first** (JSON-LD, labels, landmarks); adapters only where generic cannot reach (Greenhouse questions API) |
| (f) Optional host permissions for ATS domains, granted once | 1, and the panel button works on any tab | Best: reaches iframes, survives tab switches | One prompt from a click; host warnings for the listed sites | Strains "least permission"; still not background reading if no code runs without a gesture | Excluded by construction | Optional opt-in upgrade |

---

## 3. Findings per question

### 3.1 What the single gesture grants

- `activeTab` is enabled by exactly these gestures: executing an action (toolbar button), executing a context menu item, executing a keyboard shortcut from the commands API, accepting an omnibox suggestion. https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- With `scripting` also declared it allows `scripting.executeScript()` / `insertCSS()` on that tab and gives temporary access to the tab URL, title and favicon. Same page.
- **Persistence:** "Access to the tab lasts while the user is on that page, and is revoked when the user navigates away or closes the tab." Same-origin navigation keeps it; a different site revokes it. The page does not say what switching to another tab does. The grant is per tab, so a new tab needs its own gesture (inferred, unverified). Same page.
- Not granted on restricted pages such as `chrome://`. Same page.
- `activeTab` shows no install-time permission warning. https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings
- **Commands:** `_execute_action` can be bound to a shortcut and does not dispatch `onCommand`; users can remap at `chrome://extensions/shortcuts`; at most four suggested shortcuts. https://developer.chrome.com/docs/extensions/reference/api/commands
- **`sidePanel.open()`** "may only be called in response to a user action" (action click, shortcut, context menu, or a gesture on an extension page), needs `windowId` or `tabId`, Chrome 116+. https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- The sidePanel reference never mentions `activeTab`. **Open question (unverified):** does a click handled by `setPanelBehavior({ openPanelOnActionClick: true })` count as "executing an action" for `activeTab`? `action.onClicked` does not fire when the action has a popup (https://developer.chrome.com/docs/extensions/reference/api/action), and a Chromium-extensions thread reports `onClicked` not firing once the side panel was declared, with an `activeTab` error from `captureVisibleTab`; the visible text has no resolution, and one reply suggests calling `sidePanel.open` yourself rather than declaring the panel (https://groups.google.com/a/chromium.org/g/chromium-extensions/c/q6SuRSMIYo4). ADR-0015 assumes the icon click grants it. **Test this first (CAP-02 spike).** If it fails, set `openPanelOnActionClick: false` and handle `action.onClicked`, calling `sidePanel.open({ windowId })` synchronously and then capturing; the CAP-01 context-menu handler already opens the panel before any `await`.
- **Can the panel auto-capture from the same gesture, and is it "user-initiated"?** Technically yes: the handler runs `executeScript` under the click's grant. Against the SPEC: §2 says non-LinkedIn boards "may read the visible JD when the user presses Capture"; §1 bans "background scrape". An icon click that reads the page starts with a user action (the SPEC's own test), but the literal text names a Capture press and Feature 3 lists specific buttons. Treat it as a wording change needing approval (section 5), not a silent reinterpretation. A read on panel open **without** a gesture (restored state, tab-switch event) would break the rule and must not exist.

### 3.2 Getting the application questions (read-only)

- **Greenhouse:** the public Job Board API returns application fields without auth: `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs/{job_id}?questions=true`. Each question has `label`, `required`, and `fields[]` with `name`, `type` (`input_text`, `textarea`, `multi_value_single_select`, `input_file`, ...) and `values` for selects. "Job Board data is publicly available, so authentication is not required for any GET endpoints." https://docs.greenhouse.io/job-board.html . CORS is not documented there (unverified). It is the only ATS found with a documented structured public questions endpoint.
- **Lever:** the Postings API does not expose custom questions; applicants go to the hosted form. Reads need no key; CORS is limited to the company's own domains. https://github.com/lever/postings-api . Lever questions must come from the DOM.
- **Ashby:** the public posting API returns `descriptionPlain`, location, `isRemote`, optional compensation (`?includeCompensation=true`) and `applyUrl`; it does not mention application questions. https://developers.ashbyhq.com/docs/public-job-posting-api . Useful for JD and salary, not questions.
- **Workday:** no primary documentation found; only third-party scraper listings (an internal `/wday/cxs/...` endpoint, `data-automation-id` selectors on listing pages). **Unverified.** Treat Workday forms (multi-step, login-gated, client rendered) as best-effort and do not rely on undocumented endpoints.
- **JobPosting JSON-LD:** required `title`, `datePosted`, `description`, `hiringOrganization`, `jobLocation`; recommended `baseSalary`, `directApply`; must appear "on the same page as the job description". https://developers.google.com/search/docs/appearance/structured-data/job-posting . It describes the job, not the questions. `capture-fields.ts` already reads it.
- **Generic DOM label discovery:** collect `textarea` and free-text `input` elements (plus selects and radios), naming each from `aria-labelledby` target text, `aria-label`, `<label for>` or a wrapping `<label>`, `<fieldset><legend>`, then the nearest preceding text. Skip identity fields (name, email, phone, resume/cover-letter upload, EEO/demographic). This is standard HTML/ARIA labelling (general web knowledge, not re-fetched). It is read-only: `executeScript` returns data and nothing is written.
- **Realistic vs not:** free-text questions ("Why do you want to work here?") are well labelled and should be reliable on Greenhouse, Lever and Ashby when the form is in the visible document. Character limits (`maxlength`, or "(max 500 characters)" in the label) are best-effort. Unreliable: unlabelled custom widgets, multi-step forms whose later steps are not rendered yet, questions revealed after a click, closed shadow roots, cross-origin iframes.
- **Shadow DOM:** an open root is reachable via `element.shadowRoot`; for a closed root it is `null` from outside; queries do not cross shadow boundaries, so the walker must recurse into open roots. https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow (the no-crossing point is general knowledge, implied by the examples).
- **Text quality:** `innerText` approximates what the user would copy and ignores hidden elements; `textContent` includes hidden text. https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/innerText . `snapshotPage` already prefers `innerText`.

### 3.3 Multi-frame and SPA

- `executeScript` runs in the main frame by default; `allFrames: true` runs in all frames; `frameIds` targets specific ones (not both). One result per frame, main frame first, each with `frameId` and `documentId`. https://developer.chrome.com/docs/extensions/reference/api/scripting
- It needs host permissions or `activeTab`, but the page does **not** say whether `activeTab` covers cross-origin iframes. **Unverified; test.** I expect it does not, which is the common "embedded board" case (a company page embedding a Greenhouse or Ashby form from another origin). If so, the generic path reads only the host page; the fix is option (f) plus `allFrames` and merging by `frameId`.
- `webNavigation.getAllFrames` lists frames but needs the `webNavigation` permission. https://developer.chrome.com/docs/extensions/reference/api/webNavigation . Avoid it: `allFrames: true` already returns every frame it can inject; report any that dropped out as "part of this page could not be read".
- **SPA navigation:** `webNavigation.onHistoryStateUpdated` fires on `pushState` (same page), but capture is on demand, so no listener is needed. A stale draft is a state problem: store `tabId` and URL with the draft; on `tabs.onActivated` / `tabs.onUpdated` compare, and if the URL differs show a banner "This draft is from <host>. Capture this page instead?" with a button. `Tab.url` is present only with the `tabs` permission or host permission (activeTab grants it temporarily); `onActivated` may fire before the URL is set. https://developer.chrome.com/docs/extensions/reference/api/tabs . Without that access, degrade to a manual "Capture this page" button. The banner reads nothing.
- **Panel across tabs:** a global panel "remains open when navigating between tabs (if set to do so)"; a tab-specific panel is hidden on tabs where it is not enabled; `onOpened` (Chrome 141+) and `onClosed` (Chrome 142+) exist. https://developer.chrome.com/docs/extensions/reference/api/sidePanel . Slayply uses one global panel, so the draft survives tab switches. Persist it in `storage.session` so closing and reopening the panel does not lose a review.

### 3.4 LinkedIn

- User Agreement section 8.2 prohibits developing, supporting or using "software, devices, scripts, robots or any other means or processes (such as crawlers, browser plugins and add-ons or any other technology)" to scrape, and "bots or other unauthorized automated methods to access the Services". https://www.linkedin.com/legal/user-agreement (the fetched text was a summary of 8.2 items 2 and 13; read the full page before changing the LinkedIn rule).
- The fail-closed rule stays: no page snapshot, label scan or JSON-LD read on `linkedin.com`, `linkedin.cn`, `lnkd.in` and subdomains. Selected text only.
- Even the selection read injects a script into a LinkedIn tab (ADR-0015 accepted that). The strictest route is the context menu, where `info.selectionText` needs no injection. Maintainer decision: allow the icon click to read the selection on LinkedIn, or make the menu the only LinkedIn route.
- Never request optional host permissions for LinkedIn.

### 3.5 Review-then-generate UX

Fetched primary guidance:

- NN/g on progressive disclosure: show the few most important options first, defer advanced ones, keep to at most two disclosure levels, make the path to the rest obvious. https://www.nngroup.com/articles/progressive-disclosure/
- I tried NN/g's usability heuristics page (404) and did not retrieve Material or Apple HIG, so nothing below cites them.

Design (reasoned from the above and the product, not from a cited rule):

- **One screen, three blocks.** (1) Job: title, company, location, salary as editable inputs, each with a source chip ("from page data", "from the page title", "guessed", "empty"); confidence order: JSON-LD > labelled line > title heuristic > empty. (2) Questions: a checklist; each row editable with a `maxChars` input and its own "Generate"; unchecked rows are skipped; "Add question" at the bottom. (3) Job description: collapsed with a character count and "Edit". Raw JD, notes and limits sit one level down.
- **Primary action:** "Generate N answers". Secondary: per-row Generate, "Run fit check".
- **States:** *Loading* (short skeleton). *Empty* ("No questions found. They may load on the next step. Paste them or select text and click the icon again."). *Partial* ("Read the page but not the embedded form from another site", with the option-f prompt). *Error* (restricted page, LinkedIn, tab gone): one-line cause plus the fix action. *Stale* (tab moved on) as in 3.3.
- Never block on low confidence: show it, mark it, let the user generate anyway.

---

## 4. What exists and what to reuse (branch `feat/CAP-01-selection-job-capture`)

Reuse:

- `lib/capture-fields.ts` `extractJobFields`: JSON-LD first, title heuristics, labelled-line and salary regexes, 120-char caps. Add a per-field `source` for the confidence chips.
- `lib/page-snapshot.ts` `snapshotPage`: self-contained injected function, `main/[role=main]/article` then body fallback, JSON-LD capped at 10 x 200 KB, 60k chars. Extend it (still no imports) to return `questions[]`.
- `lib/capture.ts`: `isLinkedInUrl` (fails closed), `captureFromTab`, `captureSelection`, `parsePending` validation, `CAPTURE_TEXT_MAX`.
- `lib/capture-inbox.ts` (`storage.session` handoff, read once) and the worker pattern of calling `sidePanel.open` before any `await`.
- `lib/capture-browser.ts` `browserCaptureDeps` (the injection seam) and the linkedom fixture tests.

Change:

- `Capture` is one `{ kind, text }`. Replace with `JobDraft = { url, tabId, fields, jd, questions[], notes, partial }` produced by one capture. Keep `kind` only for the "selection, then relabel" case.
- `capture-view.tsx` / `capture-panel.tsx`: the draft -> kind picker -> "Use" -> repeat loop is the friction. Replace with the review screen; the `Incoming`/`onIncoming` handoff to the generate panel goes away.
- `background.ts`: add `action.onClicked` (or keep `openPanelOnActionClick` if the spike proves the grant) and `commands`; keep the context menu for selections and LinkedIn.
- `BLOCKED_MESSAGE` ("click the toolbar icon first") leaves the main path.

---

## 5. SPEC and ADR changes required

SPEC changes need an approved Spec change proposal (SPEC header).

1. **§2 and Feature 3 wording (needed).** Today: "'Capture selection' (context menu + panel button) -> choose: JD, Questions, or Notes" and "may read the visible JD when the user presses Capture". Proposed: "One capture gesture (toolbar icon, keyboard shortcut, panel button or context menu) reads the visible JD, application questions and job details from the page the user is on, or the user's selection if one exists, into one editable draft. Nothing is read without such a gesture." Same principle (every read starts with a user action), but it widens "reads the JD" to "reads form labels" and makes the icon click a Capture.
2. **Reading form labels is new.** SPEC mentions only the visible JD. Add the rule: read label/legend/aria text, field types and limits only; **never read field values**, so nothing the user typed or autofilled is captured.
3. **Optional ATS host permissions (option f).** Acceptable only as a fixed list (candidates: `boards.greenhouse.io`, `job-boards.greenhouse.io`, `boards-api.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com`, `*.myworkdayjobs.com`; exact hosts unverified), requested via `permissions.request` from a click (a user gesture is required: https://developer.chrome.com/docs/extensions/reference/api/permissions), opt-in, revocable, with no `content_scripts` and no read triggered by tab events. Add to §2: "A host permission exists only to make a user-triggered capture work; it never triggers a read."
4. **A successor ADR** to ADR-0015 recording the icon-click decision, the `activeTab` spike result and the LinkedIn script-injection choice.
5. **LinkedIn:** no SPEC change; keep the rule. Optional tightening per 3.4.
6. **Greenhouse questions API (CAP-06)** sends a board token and job id to `boards-api.greenhouse.io`. SPEC §1 and the privacy text name only the LLM provider, so add a sentence to the privacy statement and `docs/LEGAL.md`, or skip the API and use the DOM only.

---

## 6. Risks and unverified items

| Item | Status | How to settle |
|---|---|---|
| `openPanelOnActionClick: true` grants `activeTab` | Unverified; one forum report points the other way | CAP-02 spike; fallback `action.onClicked` + `sidePanel.open` |
| `_execute_action` shortcut fires `action.onClicked` and grants `activeTab` | activeTab page lists shortcuts as a gesture; `onClicked` behaviour not stated | Test |
| `activeTab` covers cross-origin iframes | Not stated in scripting docs | Test on a Greenhouse embed on a third-party site |
| `activeTab` after switching away and back | Not stated | Test; assume per-tab, expiring on cross-site navigation |
| CORS for `boards-api.greenhouse.io` | Not documented | Assume a host permission is needed |
| Workday form structure, iframes, shadow DOM, login gates | No primary source | Inspect a real tenant; ship as best-effort |
| Greenhouse embed mechanism (script vs iframe) | Official page not retrieved | Inspect a live embed |
| Lever / Ashby form markup | Lever API confirmed to omit questions; Ashby silent | Inspect live forms |
| NN/g heuristics, Material, Apple HIG | Not fetched; not cited | n/a |
| False positives (search box, newsletter, cookie banner) | Expected | Skip rules; user can uncheck before generating |
| Large pages: `innerText` layout cost | Not measured | Keep the 60k cap; measure on a long page |
| SPA form not rendered when the icon is clicked | Likely on multi-step flows | Empty state with a re-capture button; no polling |

---

## 7. Proposed roadmap breakdown

Replaces the unshipped part of `CAP-01` scope; `JOBS-01` / `HIST-01` can later persist the `JobDraft`.

| ID | Title | Size | Acceptance criteria |
|---|---|---|---|
| **CAP-02** | One-click capture: icon / shortcut -> JobDraft | M | Spike result recorded in the new ADR (does `openPanelOnActionClick` grant `activeTab`; else `action.onClicked` + `sidePanel.open` before any `await`). Icon click and `_execute_action` shortcut open the panel and fill one `JobDraft` (JD, fields) from the active tab; a selection, if any, wins over the page; on LinkedIn URLs (including `lnkd.in` and trailing-dot hosts) the page snapshot is never called, only the selection is read; restricted pages show a one-line reason; no permission beyond `activeTab`, `scripting`, `commands`. Manual test: Greenhouse page, one click, panel populated. |
| **CAP-03** | Detect application questions | M | `snapshotPage` returns `questions[]` (label, field type, required, `maxChars` from `maxlength` or label) from label/legend/aria discovery, recursing into open shadow roots; never reads field values; skips identity/upload/EEO fields and hidden elements. linkedom fixture tests for Greenhouse-, Lever- and Ashby-shaped forms, an `aria-labelledby` case, a shadow-root case and a no-questions page. Finding none is not an error. |
| **CAP-04** | Review screen and generate wiring | M | Single review screen: editable job fields with source/confidence chips, collapsible JD, question checklist with per-row edit / `maxChars` / Generate, "Generate N answers", and the loading / empty / partial / error / stale states from 3.5; replaces the kind picker and "Use" loop; paste moves to "Paste instead"; draft persisted in `storage.session`; the generate panel reads from the draft. Component test per state. |
| **CAP-05** | Optional ATS host permissions and iframe capture | M | Settings toggle "Capture on job sites" requests the fixed origin list from a click (never LinkedIn); when granted, capture uses `allFrames: true` and merges by `frameId`; the panel's "Capture this page" works on any tab without clicking the icon first; revoking falls back to CAP-02 behaviour; no `content_scripts`; partial-frame notice. Needs section 5 item 3 approved. Manual test: a third-party page embedding a Greenhouse form. |
| **CAP-06** | Greenhouse questions API adapter (optional) | S | When the URL maps to a Greenhouse board and job id and the host permission is held, fetch `?questions=true` and merge the structured questions over the DOM result; any failure falls back silently to the DOM. Privacy text updated (section 5 item 6). |
| **CAP-07** | Tab-change and SPA staleness banner | S | Draft stores `tabId` and URL; on tab switch or URL change a non-blocking banner offers "Capture this page"; nothing is read without that click; works without the `tabs` permission by degrading to a manual button. |
| **CAP-08** | Docs and hardening | S | SPEC §2 / Feature 3 text (after approval), successor ADR, HANDBOOK and README privacy note; size and frame-count caps tested; Playwright smoke for the one-click path if feasible. |

Suggested order: CAP-02 spike first (it fixes the base mechanism), then CAP-03, CAP-04, CAP-07; CAP-05 and CAP-06 only if the iframe test shows the generic path is not enough.
