# Pinned & Verified Versions

All tools, runtimes, dependencies, platform limits, and APIs pinned for Slayply.
Every fact in this document was verified on the stated date with a source link (Rule 1: Verify, don't recall).

## System Runtimes & Package Managers

| Component | Pinned Version | Verification Date | Source Link / Verification Method | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Node.js** | `^24.21.0` | 2026-10-29 | `node --version` (v24.21.0 locally installed; https://nodejs.org/) | Active LTS on local machine |
| **pnpm** | `^12.6.0` | 2026-10-29 | `pnpm --version` (v12.6.0 locally installed; https://pnpm.io/) | Fast monorepo package manager |
| **Git** | `^2.53.0` | 2026-10-29 | `git --version` (v2.53.0.windows.2 installed; https://git-scm.com/) | Version control |

## Workspace Tooling

| Package | Pinned Version | Verification Date | Source Link | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **turbo** | `2.11.10` | 2026-10-29 | [npm turbo](https://www.npmjs.com/package/turbo) | Monorepo build orchestrator |
| **typescript** | `7.0.2` | 2026-10-29 | [npm typescript](https://www.npmjs.com/package/typescript) | Strict type checking across workspace |
| **@biomejs/biome** | `2.6.3` | 2026-10-29 | [npm @biomejs/biome](https://www.npmjs.com/package/@biomejs/biome) | Formatter & linter (Rust-based, fast) |
| **vitest** | `5.0.5` | 2026-10-29 | [npm vitest](https://www.npmjs.com/package/vitest) | Unit & integration test runner |

## Frameworks & Core Libraries

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
| **Render Free Web Service** | Spins down after 15 min of inactivity; ~50s cold start; 512MB RAM, 0.1 CPU; 100GB/mo bandwidth | 2026-10-29 | [Render Free Tier Limits](https://render.com/docs/free) | Side panel pings `/health` immediately on open to warm up relay; UI shows warmup animation; fallback to Direct Mode on 60s timeout |
| **Render Static Site** | 100GB/mo free bandwidth, zero cold starts, continuous deploys from Git | 2026-10-29 | [Render Static Sites](https://render.com/docs/static-sites) | Used for `apps/site` (landing page + privacy notice) |
| **LinkedIn Terms of Service** | Section 8.2 bans scraping, bots, automated navigating/filling/submitting | 2026-10-29 | [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement) | Slayply strictly enforces zero automation on LinkedIn: user must select text and manually paste answers |

## Provider APIs & Auth

| Provider | Endpoint / Auth Protocol | Verification Date | Source Link | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Anthropic** | `POST https://api.anthropic.com/v1/messages`<br>`x-api-key`, `anthropic-version: 2023-06-01` | 2026-10-29 | [Anthropic API Docs](https://docs.anthropic.com/) | Streaming messages endpoint |
| **OpenAI** | `POST https://api.openai.com/v1/chat/completions`<br>`Authorization: Bearer <key>` | 2026-10-29 | [OpenAI API Docs](https://platform.openai.com/docs) | Chat completions endpoint |
| **Google Gemini** | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`<br>`x-goog-api-key` | 2026-10-29 | [Google AI Gemini Docs](https://ai.google.dev/api) | Gemini streaming API |
