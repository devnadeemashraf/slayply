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
- **Constraint:** LinkedIn strictly prohibits the use of automated software, bots, scrapers, crawlers, or browser extensions that automate browsing, data extraction, or form submission.
- **Slayply Guarantee:**
  1. Zero DOM mutation on LinkedIn pages.
  2. Zero automated browsing, auto-filling, or auto-submission.
  3. No background scraping or DOM inspection of LinkedIn tabs.
  4. User must manually select text, trigger "Capture Selection", and manually copy/paste output into LinkedIn.

### Google Chrome Web Store Policy
- Extension adheres to Google's Manifest V3 Single Purpose Policy.
- Side Panel API used strictly within user-initiated sessions.
- Zero obfuscated or dynamically evaluated code (`eval()`).

---

## 4. Privacy, Telemetry & Data Sovereignty
- **Zero Server Retention:** The relay (`apps/relay`) never logs or stores request payloads, resumes, prompts, or API keys.
- **Local-Only Storage:** User profile facts, saved resumes, and application logs exist solely within local browser storage (`IndexedDB` and `chrome.storage.local`).
- **Provider Policies Apply:** When a user issues a generation request, the necessary context is dispatched to the chosen LLM provider (Anthropic, OpenAI, or Google) using the user's personal API key. The user's account agreement and privacy policy with that provider govern the handling of that data.

---

## 5. Minors & Financial Compliance
- Slayply does not collect personal data from any user, including minors.
- Slayply handles no payments, subscriptions, or credit card transactions. API usage fees are paid directly by the user to their selected AI provider.
