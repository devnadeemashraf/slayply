# Slayply Legal, Intellectual Property & Privacy Notice

> [!NOTE]
> This document is for informational and architectural guidance. It does not constitute formal legal or financial advice.

---

## 1. Project License
Slayply is licensed under the **MIT License**.
- Permissive open-source license allowing commercial and private use, modification, and distribution.
- Requires copyright and permission notices in all copies or substantial portions of the software.

---

## 2. Dependency Licensing Audit
All third-party dependencies used across the monorepo must adhere to compatible permissive open-source licenses:
- **MIT / ISC / BSD-2 / BSD-3 / Apache-2.0:** Permitted for all dependencies and development tooling.
- **GPL / AGPL:** Prohibited in packages or client-side bundles to avoid copyleft viral licensing encumbrance on the extension code.

---

## 3. Platform Terms of Service & Compliance

### LinkedIn User Agreement (Section 8.2)
- **Constraint:** Section 8.2 of the User Agreement prohibits, among other things, using software, scripts or robots to scrape or copy the Services, using bots or other unauthorized automated methods to access them, and overlaying or modifying them. Re-read the current text at https://www.linkedin.com/legal/user-agreement before citing a specific sub-item.
- **Slayply Guarantee:**
  1. Zero DOM mutation on LinkedIn pages.
  2. Zero automated browsing, auto-filling, or auto-submission.
  3. No background scraping or DOM inspection of LinkedIn tabs.
  4. User must manually select text, trigger "Capture Selection", and manually copy/paste output into LinkedIn.

### Google Chrome Web Store Policy
- Extension adheres to the Chrome Web Store single-purpose policy and Manifest V3 requirements (no remotely hosted code).
- Side Panel API used strictly within user-initiated sessions.
- No obfuscated code, and no `eval()` or `new Function()` (Manifest V3's extension-page CSP forbids them).

---

## 4. Privacy, Telemetry & Data Sovereignty
- **Zero Server Retention:** The relay (`apps/relay`) never logs or stores request payloads, resumes, prompts, or API keys.
- **Local-Only Storage:** User profile facts, saved resumes, and application logs exist solely within local browser storage (`IndexedDB` and `chrome.storage.local`).
- **Provider Policies Apply:** When a user issues a generation request, the necessary context is dispatched to the chosen LLM provider (Anthropic, OpenAI, or Google) using the user's personal API key. The user's account agreement and privacy policy with that provider govern the handling of that data.
- **Greenhouse job lookup (`CAP-06`):** Only when the user has switched on "Capture on popular job sites" and captures a Greenhouse job page, the extension asks Greenhouse's public Job Board API (`boards-api.greenhouse.io`) for that job's application questions. The request carries the board name and job number already in the page address and no personal data, key or cookie. The reply is used locally.

---

## 5. Minors & Financial Compliance
- Slayply does not collect personal data from any user, including minors.
- Slayply handles no payments, subscriptions, or credit card transactions. API usage fees are paid directly by the user to their selected AI provider.
