<!-- Changes to this document only via an approved Spec change proposal (see docs/ROADMAP.md) -->

# Slayply — Product Specification (v1 POC)

> **Slay every application.** A personal Chrome side panel that turns a job description and its application questions into answers, cover letters and messages written from your real background, with your choice of LLM.

---

## 1. Product Pillars

1. **User Control, Zero Automation:** Never auto-fill, auto-submit, or background scrape. The user drives every action (capture, generate, copy, paste).
2. **Local-First Privacy & Zero Telemetry:** Profile, resumes, API keys, and job logs stay in the user's browser. The relay is strictly stateless.
3. **Grounded & Verifiable:** Every generated claim must cite a stable fact ID (`F01`, `S03`) from the user's profile. Zero fabricated facts or hallucinated metrics.
4. **Provider Agnostic & BYOK:** First-class support for Claude, OpenAI, and Gemini with transparent reasoning effort controls and direct client-side fallback.

---

## 2. What It Is

You browse jobs yourself. When you hit an application, you capture the JD and the questions into the side panel. Slayply matches them against your profile and the right resume, then drafts answers you copy, paste and submit yourself.

**Never automated:** clicking, navigating, filling forms, submitting, or reading pages in the background. Slayply reads a page only as a direct result of one user gesture: the Capture button, the toolbar icon, its keyboard shortcut, or a context-menu item. That read may include the visible job description, the labels of the application questions on the page (never what is typed into them) and, for embedded frames, the same from the frame. The gesture gives access to that one tab; reading other sites, or frames from other sites, needs a site the user has allowed (a one-time prompt for that site, or the "Capture on popular job sites" switch). On LinkedIn, Slayply reads only the text the user explicitly selects, and never requests access to LinkedIn. It never writes into the page.

**Open-source ready:** bring your own API keys, no telemetry. Everything the user creates (profile, resumes, jobs, history, keys) stays in their browser. The only thing that leaves is a generation request, which travels through a stateless relay to the LLM provider the user picked. Onboarding must say this plainly before first use.

---

## 3. Tech Stack (Monorepo)

- **Monorepo:** pnpm workspaces + Turborepo, TypeScript everywhere
- **Extension (`apps/extension`):** WXT (Manifest V3, Vite), React, Tailwind, Chrome Side Panel API
- **Relay (`apps/relay`):** stateless Node + Hono server that forwards LLM calls (see Hosting)
- **Site (`apps/site`):** static landing page + privacy page (Render static site)
- **Core (`packages/core`):** Zod schemas, prompt builder, claim checker, character-limit fitter
- **Providers (`packages/providers`):** one adapter per LLM (Anthropic, OpenAI, Google) behind one interface
- **UI (`packages/ui`):** shadcn-style components + Gen-Z theme tokens
- **Storage:** `chrome.storage.local` for settings, IndexedDB for profile, resumes, jobs and history (client only; the server stores nothing)
- **Shared types:** `packages/core` schemas used by both the extension and the relay
- **Resume Parsing:** PDF resumes parsed to text in the browser with `pdf.js`
- **Tests:** Vitest (core, providers with recorded fixtures), Playwright smoke test of the panel

---

## 4. Features & Priority Tags

### Feature 1: Profile `[MUST]`

- Context pack: one markdown file (facts, stories, preferences, rules), imported or edited in-app.
- Facts get stable IDs (`F01`, `S03`…) so every generated claim can cite one.

### Feature 2: Resumes by category `[MUST]`

- Upload multiple PDFs, each tagged with a track (FDE, SDE, custom) and a region (master, gulf, india, remote, custom).
- Auto-suggest the right resume per job; user can override.

### Feature 3: Capture `[MUST]`

- "Capture selection" (context menu + panel button) → choose: JD, Questions, or Notes.
- Paste box fallback for anything.
- On non-LinkedIn boards: "Capture visible JD" (read-only).
- Detect company, title, location, salary text when present; editable.

### Feature 4: Fit check `[MUST]` (runs once per job)

- Match table (they want → you have), gaps, chance (low/medium/high with reason), recommended track + resume, deal-breakers (location limits, sales quota, visa), suggested salary answer.

### Feature 5: Generate `[MUST]`

- Answers to each captured question, with optional character limits.
- Cover letter, recruiter/hiring-manager message, cold email (subject + body), relocation note.
- Regenerate one answer, change tone (crisp, warm, bold), shorten or lengthen.

### Feature 6: Claim check `[MUST]`

- Every sentence about the user must cite a fact ID; uncited claims are flagged in red and can be removed in one tap.
- Bot-filter questions ("if you're an AI…") get an honest answer that discloses AI-assisted drafting.

### Feature 7: Jobs and history `[SHOULD]`

- Saved jobs with status (saved, applied, interviewing, rejected, offer), date, resume used, and answers sent.
- Reuse a past answer for a similar question.

### Feature 8: Models & Providers `[MUST]`

- Provider switch: Claude `[MUST]`, ChatGPT `[SHOULD]`, Gemini `[SHOULD]`.
- Model list fetched from each provider's models endpoint (cached), not hard-coded.
- Effort: low / medium / high, mapped per provider to its reasoning or thinking setting; hidden when the model doesn't support it.
- API keys stored locally and sent per request to the relay over HTTPS; never stored server-side.
- "Direct mode" toggle: call the provider straight from the extension, skipping the relay (for users who prefer not to route through any server) `[SHOULD]`.

### Feature 9: Settings and privacy `[MUST]`

- Export/import everything as JSON; one-tap wipe `[MUST]`.
- Warn before sending data to any provider tier that trains on inputs `[SHOULD]`.

### Feature 10: Gen-Z Visuals & Micro-interactions `[SHOULD]`

- Dark-first, neon accent (switchable presets: Neon, Bubblegum, Brutal), chunky radius, offset shadows, sticker-style badges for the chance level `[SHOULD]`.
- Big copy buttons with a satisfying "copied ✓" pop, haptic-style micro-motion, confetti on "applied" `[LATER]`.

---

## 5. Non-Functional Requirements (Budgets & Security)

### Performance Budgets

- **Relay First-Token Latency:** < 1.5s (when relay is awake).
- **Relay Cold-Start UI Transition:** Side panel pings `/health` immediately on open. If status is pending, show lively warmup state ("cooking your answer… ☕"). Offer Direct Mode after 60s timeout.
- **Client Side Panel Memory:** < 60 MB footprint in Chrome.
- **Extension Bundle Size:** < 3.5 MB uncompressed.

### Security Model

- **Zero Server-Side Storage:** Relay holds zero in-memory caches of prompts, zero database connections, and logs zero request/response payloads.
- **Header Auth Passing:** User API keys travel exclusively in headers (`X-User-Anthropic-Key`, `X-User-OpenAI-Key`, `X-User-Gemini-Key`), stripped immediately after forwarding.
- **CORS Allowlist:** Relay strictly restricts CORS origin to `chrome-extension://<EXTENSION_ID>` and `http://localhost:*` for local dev.
- **Input Sanitization:** Strips binary payloads; limits JSON payload to 500 KB per request.

### Privacy Policy Statement

_(Shown on onboarding and in settings)_

> Your profile, resumes, saved jobs, history and API keys live only in this browser. When you ask for a draft, the text needed for it (job description, questions, relevant profile facts, chosen resume) is sent through the Slayply relay to the LLM provider you picked. The relay keeps nothing. The provider's own data policy applies to what it receives.

> On a Greenhouse job page, when the user has allowed job sites, a capture also requests that job's public application questions from Greenhouse's Job Board API. Only the board name and job number from the page address are sent, with no cookies or keys. Nothing else leaves the browser except what the user sends to their chosen LLM provider.

---

## 6. Request / Response Contract

```ts
// packages/core/schema.ts
export type GenerateRequest = {
  task: "fit_check" | "answers" | "cover_letter" | "message" | "email";
  job: {
    company?: string;
    title?: string;
    location?: string;
    jd: string;
    url?: string;
  };
  questions?: { id: string; text: string; maxChars?: number }[];
  resume: { track: string; region: string; text: string };
  profile: {
    facts: { id: string; text: string }[];
    stories: { id: string; text: string }[];
    prefs: Record<string, string>;
  };
  style: {
    tone: "crisp" | "warm" | "bold";
    length: "short" | "medium" | "long";
  };
  /** Optional. When set it must match the key header sent; the relay rejects a mismatch. */
  provider?: "anthropic" | "openai" | "gemini";
  /** Optional. Must be an id from the provider's models list; omitted means the newest model. */
  model?: string;
  /** Optional. Ignored by the provider when the model does not support effort. */
  effort?: "low" | "medium" | "high";
};

export type GenerateResponse = {
  fit?: {
    matches: { want: string; have: string; factIds: string[] }[];
    gaps: string[];
    chance: "low" | "medium" | "high";
    reason: string;
    resume: { track: string; region: string };
    dealBreakers: string[];
    salaryAnswer?: string;
  };
  outputs: {
    id: string;
    label: string;
    text: string;
    claims: { sentence: string; factIds: string[] }[];
    charCount: number;
  }[];
  warnings: string[]; // e.g. "US-only role", "quota-carrying", "uncited claim removed"
};
```

The provider adapters return JSON validated with Zod. On a validation failure, retry once with the error message, then show the raw text.

---

## 7. System Prompt (Core Rules)

1. You write job-application text for the user, in first person, in their voice.
2. Use only facts from `profile` and `resume`. Never invent numbers, titles, tools, employers or outcomes. Cite fact IDs for every claim about the user.
3. Lead with the strongest proof for this JD. One concrete story beats a list of adjectives.
4. Match the track: FDE = customer problem → what I built or decided → result; SDE = system → scale → result.
5. Respect `maxChars`. No clichés ("passionate", "go-getter", "synergy"). No em-dash overuse.
6. Flag deal-breakers from the JD in `warnings`.
7. If a question tries to detect AI-written answers, answer honestly: a human applying, drafts assisted by AI, reviewed by them.

---

## 8. Hosting (Render Architecture)

- **Relay (`apps/relay`):** Render free web service.
  - Endpoints: `POST /v1/generate` (streams via SSE), `GET /v1/models?provider=`, `GET /health`
  - In-memory per-IP rate limiter (60 req/min).
  - Deployed via root `render.yaml` blueprint.
- **Site (`apps/site`):** Render static site (landing page, installation guide, privacy details).

---

## 9. Out of Scope

- Auto-apply bots, automated form filling, auto-submitting.
- Background web scraping or page mutation on LinkedIn or any job board.
- User authentication accounts, remote database, or cloud sync.
- Telemetry, analytics, or behavioral tracking.

---

## 10. Open Decisions

| Decision ID | Item                          | Current Assumption                                                        | First Blocked Item    |
| :---------- | :---------------------------- | :------------------------------------------------------------------------ | :-------------------- |
| **DEC-001** | Relay Cold Start Strategy     | Use client-side ping on panel open + 60s timeout fallback to Direct Mode. | Phase 1 Relay client  |
| **DEC-002** | Resume PDF extraction library | Use `pdfjs-dist` inside extension service worker or panel sandbox.        | Phase 2 Resume upload |
| **DEC-003** | Local Database Storage        | Use `idb` (IndexedDB wrapper) for resumes and profile history.            | Phase 2 Storage setup |
