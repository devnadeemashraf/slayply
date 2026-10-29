# Security Policy

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on [the repository](https://github.com/devnadeemashraf/slayply/security/advisories/new). Do not open a public issue or pull request for a vulnerability.

Include what you found, how to reproduce it, and the impact you expect. You will get an acknowledgement as soon as the maintainer can respond; this is a solo project, so please allow a few days.

## What matters most here

Slayply's promises are the security boundary. A report is in scope if it breaks one of these:

- The relay stores, caches or logs request or response content, or user API keys.
- A user API key is exposed anywhere other than the single outbound request it belongs to (logs, error messages, URLs, responses, extension storage readable by pages).
- The relay accepts requests from origins other than the extension and local development.
- Oversized, malformed or hostile input (including prototype-pollution keys) bypasses validation or exhausts the relay.
- Model output or job-page text is rendered as HTML or executed in the extension.
- The extension reads or writes a page without the user's explicit action.

## Supported versions

The project is pre-release. Only the latest commit on `main` is supported.

## Your own keys

Slayply is bring-your-own-key. Keys are stored in your browser and sent per request to the relay, or straight to the provider in direct mode. If you suspect a key has leaked, revoke it with the provider immediately.
