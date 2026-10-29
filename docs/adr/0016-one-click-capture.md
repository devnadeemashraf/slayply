# ADR-0016: One-Click Capture from the Toolbar Icon

- **Status:** Accepted (needs the SPEC wording change below before release)
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `CAP-02`
- **Supersedes in part:** ADR-0015 (panel buttons and the "Use as…" step)

---

## Context and Problem Statement
Capture took six to ten actions (select, right-click, menu, choose a kind, "Use as…", then find the generate box). Research (`docs/research/one-click-capture-ux.md`) recommends one gesture that opens the panel, reads once, and fills it.

---

## Considered Options
1. Keep `openPanelOnActionClick: true` and capture from a panel button. Whether that click grants `activeTab` is undocumented, and a forum report says it may not.
2. **Turn the browser setting off and handle `chrome.action.onClicked`**, which is a documented `activeTab` grant. Open the side panel first (before any `await`, to stay in the user gesture), then capture.
3. A content script or broad host access: standing access, rejected in ADR-0015.

---

## Decision Outcome
Chosen Option: **2**.

- The toolbar icon and its `_execute_action` shortcut (default Alt+Shift+S, rebindable) open the panel and capture once: a selection wins; with none, the visible page is read. On LinkedIn, and on any URL that cannot be parsed, the page is never read, only a selection (`captureOneClick`, `isLinkedInUrl`).
- A capture is applied at once: the job description or question lands in the generate panel's boxes and found job fields in "Job details"; the user reviews and edits there. Only pasted text is staged, because its kind is unknown.
- The context menu stays. Restricted pages (browser pages, web store) give a one-line reason.
- Permissions are unchanged (`activeTab`, `scripting`, `contextMenus`); `commands` needs none.

## Required SPEC change (human edit; the guard blocks agents from editing SPEC)
SPEC §2 and Feature 3 name a "Capture" press. They should say that one capture gesture (a Capture button, the toolbar icon, its keyboard shortcut or a context-menu item) may read the visible job description, and that nothing is read without such a gesture.

## Consequences
- The icon no longer just opens the panel: a click on a page with nothing to capture still opens it and shows the reason.
- Selection-wins means a stray selection hides the rest of the page; the text is editable, and a click with nothing selected reads the page.
- Question detection, the review screen and staleness are `CAP-03` to `CAP-08`.
