# ADR-0017: Job-Site Access and Embedded Frames

- **Status:** Accepted (the SPEC wording change in ADR-0016 also covers this)
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `CAP-05`

---

## Context and Problem Statement
`activeTab` covers one page and, as far as the docs say, not necessarily embedded frames from another origin. Many companies embed an application form (Greenhouse, Ashby, Workday, Oracle) in their own career page, and the panel's Capture button needs a grant per site. The aim is broad board support with the smallest standing access.

---

## Considered Options
1. **A fixed, tested list of job-board hosts the user can allow with one switch, plus a one-time prompt for any other site.** Chosen by the maintainer.
2. One opt-in for all https sites: works everywhere, but Chrome warns "read all your data on all websites".
3. Per-site prompts only: least access, but embedded forms from another origin each prompt separately.

---

## Decision Outcome
Chosen Option: **1**.

- `JOB_SITE_ORIGINS` (`lib/job-sites.ts`) lists application and careers hosts only (Greenhouse, Lever, Ashby, Workday job sites, Taleo, iCIMS, SmartRecruiters, Workable, Jobvite and others). HR, payroll, learning and cloud-platform domains are deliberately left out, including all of `oraclecloud.com` (it hosts Oracle Recruiting tenants next to storage and customer apps, and a match pattern cannot wildcard the middle of a host), so Oracle and similar sites use the one-time per-site prompt. The Settings switch "Capture on popular job sites" requests the list (a click, so the browser may prompt) and removes it; it shows on while any listed host is still granted.
- The manifest declares `https://*/*` as an optional host permission (`lib/manifest-hosts.ts`, guarded by a test) so the browser accepts these requests; nothing is granted at install. This also fixes the per-site prompt added in `CAP-02`, which had no declared origin to ask for.
- Capture runs `executeScript` with `allFrames: true`. The top page comes first; `mergeSnapshots` adds the questions, structured data and text of embedded frames, ignores near-empty frames (ads, widgets), drops repeats and keeps the 60,000-character and 40-question caps. A frame the extension may not access is left out silently. The top frame is always required (an embedded frame never stands in for it) and sets the title; the text budget is shared between frames. A selection is taken from the top page first, then from another frame; a LinkedIn frame embedded in another site is ignored.
- `snapshotPage` refuses LinkedIn hosts itself and returns an empty snapshot before touching the document. This runs in every frame, so a LinkedIn frame inside another site is not read even if a grant covered it.
- Question detection also finds `role="textbox"` and `contenteditable` widgets by label only, never their content (custom widgets are common on enterprise boards).

## Consequences
- The vendor hosts are from general knowledge and unverified (`docs/VERSIONS.md`); a missing host just falls back to the one-time prompt.
- Workday and Oracle forms are untested against real pages. They are reached by the generic label scan; vendor-specific handling needs saved pages of real forms.
- Which frames were skipped for lack of access is not reported.

## Amendment (CAP-06): Greenhouse questions API

`https://boards-api.greenhouse.io/*` joins the job-site list. On a Greenhouse job page (exact hosts, board and job id read from the URL) a capture also makes one credential-less GET with no redirects, a 5 s timeout and a 2 MB cap, and merges the custom questions over the page result (the page's widget type and limits win). It never prompts: without the grant it does nothing. The switch reads on only while the API host is granted, so anyone who enabled it before CAP-06 sees it off and re-enables it once. Not covered: a Greenhouse form embedded in a company page (the tab URL is not a Greenhouse host); the DOM capture still handles it.
