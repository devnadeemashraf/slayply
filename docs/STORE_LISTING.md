# Chrome Web Store Listing

Paste these into the developer dashboard. A test (`apps/extension/src/lib/permissions.test.ts`) pins the permission list below, so changing a permission means editing both.

## Name and summary

- **Name:** Slayply
- **Summary (132 characters max):** Draft honest job-application answers from your own saved facts. You copy and paste; nothing is auto-filled or submitted.

## Description

Slayply is a side panel for job applications. Capture a job description and its questions, and Slayply drafts answers using only the facts you saved about yourself. Every first-person claim must cite one of your facts; sentences without one are flagged so you can remove them.

- Bring your own API key (Claude, OpenAI or Gemini). You pay your provider directly. No accounts, no subscription, no telemetry.
- Your profile, resumes, saved jobs and keys stay in your browser.
- Drafts answers, cover letters, recruiter messages and cold emails; checks how well you fit a role.
- You copy and paste the result. Slayply never clicks, fills in or submits anything on a page.
- On LinkedIn it reads only text you select.

Open source (MIT).

## Category and language

Productivity. English.

## Privacy

- **Privacy policy URL:** `<site URL>/privacy.html` (fill in after deploying the site)
- **Single purpose:** Help a job seeker draft application answers from their own saved information.
- **Data handling disclosure:** The extension handles personally identifiable information (the profile and resume text the user saves) and website content (the job description the user captures). Both stay in the browser except for the text sent, at the user's request, to the LLM provider the user chose. Data is not sold, not used for unrelated purposes and not used for creditworthiness or lending.
- **Remote code:** No. All code ships in the package; the extension page policy is `script-src 'self'; object-src 'self'`.

## Permission justifications

| Permission | Why it is needed |
| :-- | :-- |
| `sidePanel` | The whole interface is the browser side panel. |
| `storage` | Keeps settings, the API key and the privacy acknowledgement on the device (`chrome.storage.local`). |
| `contextMenus` | Right-click "capture selection / page" on a job posting. |
| `activeTab` | When the user clicks the toolbar icon, uses the shortcut or a menu item, lets Slayply read that one tab once. No host access is granted at install. |
| `scripting` | Runs the reader in the tab the user just captured from (granted by `activeTab`), including embedded frames the user allowed. |
| Host permission: the relay (`<relay URL>/*`) | The only host granted at install. Sends generation requests to the Slayply relay and checks its health. |
| Optional: `https://api.anthropic.com/*` | Requested only if the user turns on Direct Mode, which calls Claude from the browser without the relay. |
| Optional: `https://*/*` | Never requested at install. The panel asks for one site at a time (when the user chooses to capture from it) or the fixed list of job boards when the user turns on "Capture on popular job sites". LinkedIn is never requested. |

## Screenshots to prepare

Take these from the release build, at 1280x800 (or 640x400):

1. First-run privacy screen.
2. Job tab with a captured job and questions.
3. A generated answer with its citations and a flagged sentence.
4. Fit check result.
5. Jobs tab with saved jobs.

## Support

- **Support URL / homepage:** the GitHub repository, and `<site URL>`.
- **Security contact:** GitHub private vulnerability reporting (see `SECURITY.md`).
