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

`zod` and `@types/node` are installed. The rest (wxt, react, hono, tailwind and their types) are *registry-verified* only: the exact version exists on npm, but nothing uses them yet. Re-verify when the roadmap item that introduces each one starts.

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

## Provider APIs & Auth

| Provider | Endpoint / Auth Protocol | Verification Date | Source Link | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | `POST https://api.anthropic.com/v1/messages`<br>`x-api-key` (documented as legacy but supported; `Authorization: Bearer` is also accepted), `anthropic-version: 2023-06-01` (still valid per the version history; a newer dated version exists, so decide which to pin when `PROV-01` starts). Direct calls from an extension may require the `anthropic-dangerous-direct-browser-access: true` header (*unverified*, secondary sources: test it) | 2026-10-29 | [Anthropic API Docs](https://platform.claude.com/docs/) | Streaming messages endpoint |
| **OpenAI** | `POST https://api.openai.com/v1/chat/completions` (supported) or the Responses API (recommended by OpenAI for new projects)<br>`Authorization: Bearer <key>` | 2026-10-29 | [OpenAI API Docs](https://developers.openai.com/api/docs) | Choose and record the endpoint in an ADR when `PROV-02` starts. Reasoning effort is `reasoning_effort` on Chat Completions; the Responses parameter name is *unverified*. Model IDs come from `GET /v1/models`, not from this repo |
| **Google Gemini** | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`<br>`x-goog-api-key` (add `?alt=sse` for server-sent events) | 2026-10-29 | [Google AI Gemini Docs](https://ai.google.dev/api) | Gemini streaming API |
