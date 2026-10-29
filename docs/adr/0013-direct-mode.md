# ADR-0013: Direct Mode

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `DIRECT-01`

---

## Context and Problem Statement
SPEC Feature 8 lets a user skip the relay and call the provider from the extension. Two choices last: how the extension gets permission to reach the provider, and where the switch sits in the code.

---

## Considered Options
**Permission**
1. **`optional_host_permissions` for `https://api.anthropic.com/*`, requested with `chrome.permissions.request` when the user turns Direct Mode on.** The install warning does not grow, and a user who never uses Direct Mode never grants it.
2. A static `host_permissions` entry (every user is asked at install, for a feature most will not use; against "permissions minimized", `REL-01`).
3. No permission and rely on provider CORS (unreliable from an extension origin).

**Where the switch sits**
1. **`runGeneration` takes `direct?: boolean` and picks `streamDirect` or `streamGenerate`.** Both yield text deltas and throw `RelayError`, so validation, the one re-request, preview and fit checks work unchanged.
2. A second controller for Direct Mode (duplicates validation and retry).

---

## Decision Outcome
- **Permission:** option 1. The toggle click calls `chrome.permissions.request`; if the user declines or the call fails, the setting stays off and a message says why. Turning it off needs no permission call. The granted permission is not revoked on off (the user can remove it in the browser's extension settings), and the stored setting, like the key, is removed by the data wipe.
- **Adapter:** `streamDirect` builds the same Claude adapter the relay uses (`packages/providers`) with `browserAccess: true`. It ignores the caller's `baseUrl`, so the key can only go to the adapter's `api.anthropic.com`. Failures become `RelayError` with the relay's static messages by kind; upstream text is never shown.
- **Switch:** option 1, `direct` passed from the saved setting through the generate panel to both answer and fit-check runs.
- **Scope:** Claude only, because the panel stores one Anthropic key. OpenAI and Gemini in Direct Mode arrive with the provider picker.
- **The browser opt-in header** (`anthropic-dangerous-direct-browser-access: true`) is sent. Whether an extension origin needs it is still unverified (`docs/VERSIONS.md`); sending it is harmless if not.

### Trade-offs
- The relay health banner and its "offer Direct Mode" text stay as they are; in Direct Mode the relay is simply not called for generating.
- A user can leave the permission granted after turning the mode off.

---

## Validation & Verification
- Unit tests: `streamDirect` yields deltas, sends the key only to `api.anthropic.com` with the opt-in header and never to the relay URL or into a URL, maps each failure kind to static text without the key, treats an early end as an error, rethrows an abort; `runGeneration` with `direct` hits only Anthropic URLs and still validates; the controller asks for only the Anthropic origin and stays off on decline or failure; settings store the flag and ignore non-boolean values; the settings view shows the switch; the backup never contains it.
