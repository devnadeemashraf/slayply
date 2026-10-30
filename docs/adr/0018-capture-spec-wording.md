# ADR-0018: Capture Wording for the SPEC and README

- **Status:** Proposed (needs a human edit to `docs/SPEC.md`; the guard blocks agents from editing it)
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `CAP-08`

---

## Context
`CAP-01` to `CAP-07` changed what a capture can do: a gesture other than the Capture button (toolbar icon, shortcut, context menu), a read permission per site or for a list of job boards, embedded frames, detected question labels and one public Greenhouse lookup. SPEC §1, §2, §5 and Feature 3 still describe a single Capture press and name only the LLM provider as a place data goes. ADR-0016 and ADR-0017 each carry part of the change.

## Proposed SPEC text
Replace in §2 ("Never automated") and Feature 3:

> **Never automated:** clicking, navigating, filling forms, submitting, or reading pages in the background. Slayply reads a page only as a direct result of one user gesture: the Capture button, the toolbar icon, its keyboard shortcut, or a context-menu item. That read may include the visible job description, the labels of the application questions on the page (never what is typed into them) and, for embedded frames, the same from the frame. The gesture gives access to that one tab; reading other sites, or frames from other sites, needs a site the user has allowed (a one-time prompt for that site, or the "Capture on popular job sites" switch). On LinkedIn, Slayply reads only the text the user explicitly selects, and never requests access to LinkedIn. It never writes into the page.

Add to §5 (privacy):

> On a Greenhouse job page, when the user has allowed job sites, a capture also requests that job's public application questions from Greenhouse's Job Board API. Only the board name and job number from the page address are sent, with no cookies or keys. Nothing else leaves the browser except what the user sends to their chosen LLM provider.

## Consequences
- Until the edit is made the SPEC understates what the extension does; release (`REL-01`) is blocked on it.
- README "How it works" and "Privacy" already carry this wording.
