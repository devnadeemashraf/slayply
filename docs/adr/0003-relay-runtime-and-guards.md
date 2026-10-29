# ADR-0003: Relay Runtime, Build and Request Guards

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `CORE-02`

---

## Context and Problem Statement
`apps/relay` is the first Node consumer of `@slayply/core`. It sits on the public internet, receives users' API keys and personal profile text, and must keep nothing. Four choices shape it and are expensive to change later:

1. How Node runs and bundles the TypeScript.
2. How the per-IP rate limit finds the client address behind Render's proxy.
3. How the 500 KB cap is enforced on a streamed body.
4. How `POST /v1/generate` reaches an LLM provider before any adapter exists (`PROV-01`).

---

## Decision Drivers
- No new toolchain or dependency without a reason: every pin needs a `docs/VERSIONS.md` row.
- The same build must work on Windows, in CI on Linux and on Render (`SITE-01`).
- Rejected requests must be cheap and must never echo user content or keys.
- Tests must run without a network, a real key or a sleeping clock.

---

## Considered Options
**Runtime / build**
1. **`tsc` to `dist/`, then `node dist/server.js`** (what `packages/core` already does).
2. Node native type stripping, no build.
3. `tsx` for dev plus `tsdown` or `esbuild` for production.

**Client IP**
1. **The Nth entry from the right of `X-Forwarded-For`, N from `TRUST_PROXY_HOPS` (default 0 = socket address).**
2. Leftmost `X-Forwarded-For` entry.
3. A vendor-specific header such as `True-Client-IP` (not verified for Render).

**Body cap**
1. **`Content-Length` pre-check, then a counting reader that aborts at the cap.**
2. `Content-Length` only.
3. Buffer the whole body, then measure it.

**Provider seam**
1. **`createApp({ providers })` takes adapters keyed by provider id; production passes none until `PROV-01`, so the route answers `501`.**
2. Hard-code an Anthropic call in the route.
3. Return canned output from the route.

---

## Decision Outcome
- **Build:** option 1. Core's `exports` point at `dist/*.js`, and Node refuses to strip types under `node_modules`, so option 2 cannot load `@slayply/core`. Option 3 adds two dependencies and a second compile path for no gain while TypeScript 7 builds in well under a second. `dev` rebuilds and restarts; there is no watcher.
- **Client IP:** option 1. The leftmost entry is client-controlled and would let anyone dodge the limit. The hop count is configuration because a wrong value either merges all users into one bucket or lets clients spoof. It defaults to 0 (safe locally); `render.yaml` (`SITE-01`) must set it after the hop count is checked on Render.
- **Rate limit:** fixed window per IP in a `Map`, capped at 10 000 entries (expired entries are swept first, then the oldest is evicted). The clock is injected. State is lost on restart, which Render's free tier may do at any time; the limit is a best-effort abuse brake, not a quota.
- **Body cap:** option 1. A `Content-Type: application/json` check (415) and the length pre-check give a fast `413`; the counting reader is the real guard because `Content-Length` can be absent or false. Bytes are decoded with a fatal UTF-8 decoder, so binary or invalid text is a `400`.
- **CORS:** a parsed-origin check, never `startsWith` or a regex on the raw string: `chrome-extension://<id>` must match exactly and `localhost` must be the exact hostname over `http`, any port. A request that carries a disallowed `Origin` is refused with `403`. Extension IDs come from `EXTENSION_IDS` (comma list, 32 chars `a`-`p`); it is required when `NODE_ENV=production`.
- **Provider seam:** option 1. The provider is the one whose `X-User-<Provider>-Key` header is present; zero or several is a `400`. `ProviderAdapter` lives in `apps/relay` for now because `packages/core` is compiled without DOM or Node types and the adapter needs `AbortSignal`. `PROV-01` should move it to where Direct Mode and the relay can both import it. Chunks are provider-neutral (`delta`, `done`).
- **Logging:** one line per request, `[timestamp] [status] [latency_ms] [provider] [model]`. No headers, bodies or paths. The model is `-` until the contract carries one. Latency is time until the response headers are ready (time to first byte for a stream), not the full stream duration. A mid-stream failure adds one `[stream_error]` line with the provider and nothing else.
- **Middleware order:** access log, then one step that sets CORS headers, rate-limits and only then refuses a disallowed `Origin` or answers a preflight. Limiting first means 403s and preflights are counted too; allowed origins still receive CORS headers on a `429` so the extension can read it.
- **Deferred to `PROV-01`:** a per-IP cap on open streams, a total stream deadline and a body-read timeout (a slow-drip upload holds a connection), plus keying IPv6 clients on their /64. The limiter counts requests per minute, not concurrent streams.

### Trade-offs
- Two cheap processes by hand in dev instead of a watcher.
- With `TRUST_PROXY_HOPS=0` behind a proxy everyone shares one bucket until the deploy sets it.
- A `501` from `/v1/generate` is the honest state until `PROV-01`.
- Mid-stream failures arrive as an SSE `error` event with HTTP status 200, since headers are already sent; the event text is generic and never forwards upstream messages.

---

## Validation & Verification
- Vitest integration tests drive `app.request()` with fake adapters and an injected clock: health, validation, header security, CORS allow/deny (`localhost.evil.com`, `localhost@evil.com`), the 500 KB cap with and without `Content-Length`, rate limiting, spoofed `X-Forwarded-For`, and that no payload or key appears in log output.
- Mutation spot-check during review: removing the counting reader, using `startsWith` for CORS, or taking the leftmost forwarded entry each makes a test fail.
