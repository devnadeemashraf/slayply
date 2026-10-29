# ADR-0005: Extension Shell (WXT + React) and Testable Logic

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `EXT-01`

---

## Context and Problem Statement
`apps/extension` had no code. `EXT-01` needs a Manifest V3 side panel that stores an Anthropic key locally, pings the relay on open, shows a privacy statement before any generation, and offers Direct Mode after 60 s. Two choices will last:

1. Which framework builds the extension.
2. Where the logic lives so it can be tested without a browser.

---

## Decision Drivers
- Bundle under 3.5 MB and panel memory under 60 MB (SPEC §5).
- Tests run on Node with no live network and no Chrome (CODING_STANDARDS §3).
- The API key is a secret: it must not reach logs or error messages.
- SPEC §3 already names WXT, React and Chrome Side Panel.

---

## Considered Options
**Framework**
1. **WXT** (Vite, file-based entrypoints, generates the manifest and types).
2. Plasmo.
3. Hand-rolled Vite + `manifest.json`.

**Logic placement**
1. **Plain TypeScript modules in `src/lib` that take their dependencies as arguments (storage area, `fetch`); React components only render and call them.**
2. Logic inside React hooks and components, tested with a DOM environment.
3. A shared package (`packages/ui` or a new one).

---

## Decision Outcome
- **Framework:** option 1. SPEC §3 chose it, it builds MV3 with the default strict CSP, and the production build is 227 kB.
- **Logic:** option 1. `settings.ts` takes a `StorageAreaLike` (a three-method subset of `chrome.storage.StorageArea`) and `relay-status.ts` takes a `fetch` function. Both are covered by Node tests with in-memory fakes and fake timers; no `jsdom` or Chrome stub is needed. Option 2 would need a DOM test stack for little extra coverage. Option 3 is premature: only the extension uses them.
- **Key handling:** the key is stored as plain text in `chrome.storage.local` (SPEC §5: keys live in the browser). It is validated against the same pattern the relay applies, rendered in a `password` input, never displayed back, and a storage failure raises a message that does not contain it.
- **Relay URL:** baked in at build time from `WXT_RELAY_URL` (default `http://localhost:3000`) and used for the manifest `host_permissions`, which is the only host permission requested. It grants cross-origin access rather than restricting it, and the CSP has no `connect-src`, so the single-origin limit is by construction, not enforced. The build fails on an invalid URL, on `http` for any host but `localhost`, and, when `WXT_RELEASE=1`, on a missing URL. The production URL is set by `SITE-01`.
- **Writes:** settings updates read-modify-write one object, so they run through a promise queue; overlapping calls (a double click, two panels in one process) keep each other's fields.
- **Known limit:** after the 60 s give-up the monitor stops until the panel is reopened. A retry button is deferred.
- **Relay status:** a pure `describeRelayStatus` maps elapsed time and the last probe outcome to `checking`, `warming`, `awake` or `unreachable`. `monitorRelay` probes every 3 s, aborts a probe after 10 s because a cold Render instance holds the request, stops on success, and stops at 60 s with `offerDirectMode`. Probes are not repeated after a result, so an idle panel makes no background traffic.
- **Styling:** plain CSS for now. Tailwind and the shared theme arrive with `THEME-01`.
- **Direct Mode:** the panel only tells the user it is coming; `DIRECT-01` builds it.

---

## Consequences
- Adding a setting means extending `Settings` and `parseSettings`; corrupt stored data falls back to defaults rather than throwing.
- The React layer is not covered by automated tests; it is exercised by the manual test in the roadmap.
- `@types/chrome` is a dev dependency; the extension adds `wxt prepare` to `postinstall` so `.wxt/` types exist before `typecheck`.
