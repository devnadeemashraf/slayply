# Pinned & Verified Versions

All tools, runtimes, dependencies, platform limits, and APIs pinned for Slayply.
Each row records how it was checked on the stated date (Rule 1: Verify, don't recall). `package.json` is the machine-readable source for the toolchain pins (`pnpm run doctor` reads it, not this file); keep the two in step.

**Confidence key.** *Installed* = in `package.json` and exercised by `pnpm run check`. *Registry-verified* = exact version confirmed to exist on npm, not yet installed. *Vendor docs* = read from the vendor's official page. *Unverified* = reported by a secondary source or not yet tested; verify before relying on it.

## System Runtimes & Package Managers

| Component | Pinned Version | Verification Date | Source Link / Verification Method | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js** | `>=24.21.0` (`engines`) | 2026-10-29 | `node --version` (v24.21.0 locally installed; https://nodejs.org/) | Active LTS on local machine |
| **pnpm** | `>=12.6.0` (`engines`; `packageManager` pins `12.6.0`) | 2026-10-29 | `pnpm --version` (v12.6.0 locally installed; https://pnpm.io/) | Fast monorepo package manager |
| **Git** | `>=2.50.0` (doctor) | 2026-10-29 | `git --version` (v2.53.0.windows.2 installed; https://git-scm.com/) | Version control |

## Workspace Tooling

| Package | Pinned Version | Verification Date | Source Link | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **turbo** | `2.11.10` | 2026-10-29 | [npm turbo](https://www.npmjs.com/package/turbo) | Monorepo build orchestrator |
| **typescript** | `7.0.2` | 2026-10-29 | [npm typescript](https://www.npmjs.com/package/typescript) | Strict type checking across workspace |
| **@biomejs/biome** | `2.6.3` | 2026-10-29 | [npm @biomejs/biome](https://www.npmjs.com/package/@biomejs/biome) | Formatter & linter (Rust-based, fast) |
| **vitest** | `5.0.5` | 2026-10-29 | [npm vitest](https://www.npmjs.com/package/vitest) | Unit & integration test runner |

## Frameworks & Core Libraries

`zod`, `@types/node`, `hono`, `@hono/node-server`, `wxt`, `react`, `react-dom` and their React types are installed. `tailwindcss` is *registry-verified* only: the exact version exists on npm, but nothing uses it yet. Re-verify when the roadmap item that introduces each one starts.

| Package | Pinned Version | Verification Date | Source Link | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **wxt** | `0.21.5` | 2026-10-29 | [npm wxt](https://www.npmjs.com/package/wxt) | Next-gen web extension framework (Vite + MV3) |
| **react** | `19.3.1` | 2026-10-29 | [npm react](https://www.npmjs.com/package/react) | UI library for extension side panel |
| **react-dom** | `19.3.1` | 2026-10-29 | [npm react-dom](https://www.npmjs.com/package/react-dom) | React DOM bindings |
| **@types/react** | `19.3.0` | 2026-10-29 | [npm @types/react](https://www.npmjs.com/package/@types/react) | TypeScript types for React |
| **@types/react-dom** | `19.3.0` | 2026-10-29 | [npm @types/react-dom](https://www.npmjs.com/package/@types/react-dom) | TypeScript types for React DOM |
| **hono** | `4.13.14` | 2026-10-29 | [npm hono](https://www.npmjs.com/package/hono) | Lightweight, fast web standard framework for Node relay |
| **@hono/node-server** | `2.1.5` | 2026-10-29 | [npm @hono/node-server](https://www.npmjs.com/package/@hono/node-server) | Node adapter for Hono HTTP server |
| **zod** | `4.6.7` | 2026-10-29 | [npm zod](https://www.npmjs.com/package/zod) | Runtime schema validation and TypeScript inference |
| **idb** | `8.0.4` | 2026-10-29 | [npm idb](https://www.npmjs.com/package/idb) | Promise wrapper over IndexedDB for the local profile store (DEC-003, `PROF-01`); latest tag, published 2026-10-06 |
| **pdfjs-dist** | `6.4.299` | 2026-10-29 | [npm pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) | PDF text extraction in the side panel (`RES-01`, ADR-0009); Apache-2.0; latest tag, modified 2026-10-03. Browser build `build/pdf.min.mjs` 452 kB plus worker 1.2 MB; Node tests use `legacy/build/pdf.mjs`. No `isEvalSupported` option in v6 |
| **fake-indexeddb** | `6.2.6` | 2026-10-29 | [npm fake-indexeddb](https://www.npmjs.com/package/fake-indexeddb) | Dev-only IndexedDB implementation so store tests run on Node (`PROF-01`); published 2026-10-16 |
| **@types/chrome** | `0.3.7` | 2026-10-29 | [npm @types/chrome](https://www.npmjs.com/package/@types/chrome) | Types for `chrome.sidePanel` and `chrome.storage` in the extension (`EXT-01`) |
| **tailwindcss** | `4.3.3` | 2026-10-29 | [npm tailwindcss](https://www.npmjs.com/package/tailwindcss) | Utility-first CSS framework |
| **@types/node** | `26.6.6` | 2026-10-29 | [npm @types/node](https://www.npmjs.com/package/@types/node) | Node.js type definitions |

## Target Platform & Hosting Limits

| Item | Limit / Specification | Verification Date | Source Link | Architectural Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Chrome Manifest V3** | Manifest version 3, Side Panel API `chrome.sidePanel` | 2026-10-29 | [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) | Chrome 114+ support; side panel opens alongside active tab |
| **Chrome Storage API** | `chrome.storage.local` quota: 10MB default (expandable with `unlimitedStorage` permission) | 2026-10-29 | [Chrome Storage Docs](https://developer.chrome.com/docs/extensions/reference/api/storage) | Store settings and small state in `chrome.storage.local`; store profiles and resumes in IndexedDB |
| **Render Free Web Service** | Spins down after 15 min of inactivity (vendor docs); cold start "about one minute" (vendor docs); 512 MB RAM, 0.1 CPU on `plan: free` (blueprint spec); 750 free instance hours per workspace per month; no persistent disk, may restart at any time. Outbound bandwidth counts against the workspace's included allowance; the exact figure is not in Render's docs and has reportedly changed (*unverified*: check Dashboard > Billing). SSE streaming and request timeouts on the free plan are *unverified*: test a multi-minute stream before relying on it | 2026-10-29 | [Render Free Tier Limits](https://render.com/docs/free) | Side panel pings `/health` immediately on open to warm up relay; UI shows warmup animation; fallback to Direct Mode on 60s timeout |
| **Render Static Site** | Free to deploy from Git; counts against the workspace's included bandwidth (figure *unverified*, see above); served from a CDN so there is no spin-down | 2026-10-29 | [Render Static Sites](https://render.com/docs/static-sites) | Used for `apps/site` (landing page + privacy notice) |
| **LinkedIn Terms of Service** | Section 8.2 (Don'ts) prohibits scraping or copying the Services with software, scripts or robots, using bots or other unauthorized automated methods to access them, and overlaying or modifying the Services. Re-read the current text at the link before relying on a specific sub-item number | 2026-10-29 | [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) | Slayply strictly enforces zero automation on LinkedIn: user must select text and manually paste answers |
| **Job-board hosts** | Host patterns in `apps/extension/src/lib/job-sites.ts` (Greenhouse, Lever, Ashby, Workday, Oracle, Taleo, iCIMS, SmartRecruiters, Workable, Jobvite, BambooHR and others). *Unverified*: the exact hosts of each vendor, including Oracle Recruiting Cloud and Workday tenants; also whether `activeTab` covers cross-origin iframes and whether a frame without access is skipped silently | 2026-10-30 | Vendor sites (not fetched) | Used by `CAP-05` (ADR-0017); a missing host (all Oracle tenants) falls back to a per-site prompt |

## Provider APIs & Auth

| Provider | Endpoint / Auth Protocol | Verification Date | Source Link | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | `POST https://api.anthropic.com/v1/messages`<br>`x-api-key` (documented as legacy but supported; `Authorization: Bearer` is also accepted), `anthropic-version: 2023-06-01` (pinned; still valid per the version history. `2026-10-21` exists and only removes `temperature`, `top_p`, `top_k`, which we never send). `GET /v1/models` (`limit` 1 to 1000, `after_id`; returns `data[].id` and `display_name`, newest first). Streaming events: `content_block_delta` (`text_delta`), `message_stop`, `ping`, `error` (`overloaded_error` etc.). Errors: 400, 401, 403, 413, 429, 500, 529 with `{type:"error", error:{type, message}}`. Direct calls from an extension may require the `anthropic-dangerous-direct-browser-access: true` header (*unverified*: absent from the current API overview, versioning and errors pages; test it in `DIRECT-01`: the header is sent in Direct Mode and the manual test will show whether it is needed) | 2026-10-29 | [Anthropic API Docs](https://platform.claude.com/docs/) | Verified for `PROV-01` (ADR-0004) |
| **OpenAI** | `POST https://api.openai.com/v1/chat/completions` (supported) or the Responses API (recommended by OpenAI for new projects)<br>`Authorization: Bearer <key>` | 2026-10-29 | [OpenAI API Docs](https://developers.openai.com/api/docs) | Chat Completions chosen (ADR-0011). Streams `data:` frames to `[DONE]`; reasoning effort is `reasoning_effort`; use `max_completion_tokens`. `GET /v1/models` has no capability fields, so chat and reasoning models are told apart by id pattern (*unverified* against live responses: test with a real key). Model IDs come from `GET /v1/models`, not from this repo |
| **Google Gemini** | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`<br>`x-goog-api-key` (add `?alt=sse` for server-sent events) | 2026-10-30 | [Google AI Gemini Docs](https://ai.google.dev/api) | Implemented in `PROV-03` (ADR-0012) from the documented request shape; *unverified* against live responses: bad key as 400 `API_KEY_INVALID`, `thinkingBudget` ranges, `thinkingLevel` values, model id patterns. `GET /v1beta/models` returns `models[].name`, `displayName`, `supportedGenerationMethods` |
