# ADR-0015: Capture Selection and Job Page

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `CAP-01`

---

## Context and Problem Statement
The user has to get a job description, a question or a note from a job page into the side panel. SPEC §1 and §2 forbid reading pages in the background, and LinkedIn pages may be read only through text the user selects. The extension had no content access and no context menu.

---

## Decision Drivers
- Least permission: no standing access to any site.
- Every read starts with a user click (menu item or panel button).
- LinkedIn must be refused before any script runs, not after.
- Page text is untrusted: it is validated at every hop and never executed.

---

## Considered Options
1. **`activeTab` + `scripting`, injected on click; context menu in the background worker; handoff through `chrome.storage.session`.**
2. A content script on every page (`<all_urls>` host permission): shows a button on the page, but it is standing access and sits close to scraping.
3. Optional host permission per job board: precise but one prompt per board, and unknown boards fail.

---

## Decision Outcome
Chosen Option: **1**.

- Permissions added: `contextMenus`, `activeTab`, `scripting`. No host permission is added. `activeTab` is granted for one tab when the user clicks the toolbar icon or a menu item.
- Context menu "Capture for Slayply" (job description, question, note) on a selection uses `info.selectionText` and runs no script. "Capture visible job description" on a page injects `snapshotPage`, a self-contained read-only function, and is refused for `linkedin.com` and its subdomains and for any URL that cannot be parsed (`isLinkedInUrl` fails closed). A selection is allowed everywhere.
- The side panel has the same two buttons, which run the same `captureFromTab`, plus a paste box.
- Fields come from `JobPosting` JSON-LD first, then labelled lines and the page title. The page data is parsed defensively, each value is capped at 120 characters, and a field that is not found stays empty. All fields are editable.
- The worker hands a capture to the panel through `chrome.storage.session` (memory only, trusted contexts only). The panel reads it once, validates its shape and size, and removes it.
- Notes stay in panel memory and job fields are not yet saved; `JOBS-01` and `HIST-01` persist them.

---

## Consequences
- The panel button needs `activeTab`, so after switching tabs the user may have to click the toolbar icon once; the error says so.
- `innerText` is used for layout-aware text; tests run on `textContent` (linkedom), which keeps fewer line breaks.
- Pages with no `JobPosting` data and no labelled lines give empty fields; the user fills them in.
- `linkedom` is a dev dependency for the HTML fixture tests.
