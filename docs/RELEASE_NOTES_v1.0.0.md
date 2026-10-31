# Slayply 1.0.0

First release. Slayply is a Chrome side panel that drafts honest job-application answers from facts you saved about yourself.

## Install

Download `slayply-extension.zip`, unzip it, open `chrome://extensions`, turn on Developer mode and choose Load unpacked. Check the download against `slayply-extension.zip.sha256` first. It is unsigned and not on the Chrome Web Store, so it does not auto-update.

## Disclaimer

Slayply is free, open-source software provided as is, without warranty, and is not affiliated with Anthropic, OpenAI, Google, LinkedIn or any job board. Answer generation has been tried once with a real Gemini key; Claude and OpenAI have never been tried live, and a fit check on a slow thinking model can time out. AI output can be wrong; you are responsible for what you submit and for any charges on your API key. The full text is in the README and `docs/LEGAL.md`.

## What is in it

- **Capture:** right-click a selection or page, the toolbar icon, or Alt+Shift+S. Reads the job description and the question labels (never what you typed). Greenhouse, Lever, Ashby and other boards on request; on LinkedIn only text you select.
- **Your data:** profile questionnaire and markdown import, PDF resumes read in the browser, saved jobs with a status pipeline, export, import and wipe. Everything stays in the browser.
- **Drafting:** answers, cover letters, recruiter messages, cold emails and a relocation note, with tone, length, a character limit and a fitter. Earlier answers to similar questions are offered from saved jobs.
- **Honesty checks:** every first-person claim must cite a saved fact; unsupported sentences show red with Remove. A fit check lists matches, gaps and the best resume.
- **Providers:** Claude, OpenAI and Gemini through a stateless relay, with a model and effort picker. Direct Mode calls Claude from the browser without the relay.
- **Relay:** keeps nothing, logs no content or keys, accepts only the extension and localhost, rate-limits per client.
- **Site:** landing and privacy pages; a Render blueprint for the relay and site.

## Release checks

- Extension size 2.1 MB of the 3.5 MB budget (enforced in CI).
- Relay first chunk against a stub provider well under the 1.5 s budget.
- Smoke test loads the built extension and renders the privacy gate.
- Permissions pinned by a test and justified in `docs/STORE_LISTING.md`.

## Known limits

- Only Gemini answer generation was tried live. Claude, OpenAI and Gemini model lists and effort support come from model ids and vendor docs. A fit check on a slow thinking model can run past the relay's two-minute limit and show an error with a retry button.
- The panel's look, the sticky bar and all three style presets were checked by hand only.
- Resumes with three or more columns may read out of order (use the preview). No OCR for scanned PDFs.
- The free relay sleeps when idle; the first request after a pause can take up to a minute.
- Panel memory is measured only as JS heap in the smoke test.

## Upgrading and rollback

Local data is versioned; backup files from earlier builds still import. See `docs/DEPLOYMENT.md` for deploy and rollback.
