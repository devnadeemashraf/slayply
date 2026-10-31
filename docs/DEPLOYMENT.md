# Slayply Deployment Handbook

**Status (2026-10-31):** the relay (`https://slayply-relay.onrender.com`) and site (`https://slayply-site.onrender.com`) are deployed. Steps 1 to 4 were done once; use them again for a new deploy.

> [!IMPORTANT]
> **Do this once for prebuilt downloads:** the extension now has a fixed ID, `iljnmipngombklkmmjlfgbgdbnagbnbn`. In Render, open `slayply-relay`, Environment, and add it to `EXTENSION_IDS` (comma-separated with any ID already there), then let it redeploy. Until you do, the downloaded build shows "Origin is not allowed".

Follow the steps in order. Each step ends with a check; do not move on until it passes.

**Order matters:** the relay URL must exist before the extension is built. The extension ID is fixed (step 5), so it can be added to the relay at any time.

```
1. Merge the release PR        4. Build the release extension
2. Deploy relay + site (Render) 5. Get the extension ID, set EXTENSION_IDS
3. Verify the relay and site    6. Verify end to end, publish, tag
```

## 0. Before you start

- [ ] All PRs merged; `main` is green in CI (`check` and `extension-smoke`).
- [ ] A Render account, with GitHub access granted to the repository.
- [ ] A Chrome Web Store developer account (one-time US$5 fee) if you will publish.
- [ ] At least one real API key (Anthropic, OpenAI or Gemini) for the end-to-end test. Free tiers may be unavailable or may train on your data; use a paid plan with training excluded for anything real.

## 1. Deploy the relay and the site (Render)

1. Render dashboard: **New > Blueprint**, pick this repository and branch `main`. Render reads `render.yaml` and proposes two services: `slayply-relay` (web, free) and `slayply-site` (static).
2. It asks for the two values marked `sync: false`:
   - `EXTENSION_IDS`: you do not have the real ID yet. Enter your **unpacked** extension's ID from `chrome://extensions` for now (step 5 adds the store ID). It must be 32 letters a to p, comma-separated for several. The relay refuses to start in production if it is empty or malformed.
   - `TRUST_PROXY_HOPS`: enter `1` (Render puts one proxy in front of the relay). Step 3 verifies it.
3. Apply. Wait for both builds to finish.
4. Write down the two URLs from the dashboard. They are usually `https://slayply-relay.onrender.com` and `https://slayply-site.onrender.com`, but Render adds a suffix when a name is taken. Use what the dashboard shows.

**Check:** both services show "Live". If the relay fails to start, open its logs: a message naming `EXTENSION_IDS` means the value is empty or malformed.

## 2. Verify the relay

Replace `RELAY` with the relay URL.

```
curl -i RELAY/health
```
Expect `200` and `{"status":"ok", ...}`. The first call after idle can take 30 to 60 seconds (free tier sleeps); that is the cold start the panel shows as "Waking the relay".

```
curl -i -H "Origin: https://evil.example" RELAY/health
```
Expect `403` with `FORBIDDEN_ORIGIN`.

```
curl -i -X POST -H "Content-Type: application/json" -d "{}" RELAY/v1/generate
```
Expect `400` with `MISSING_API_KEY`. (No key, no work: nothing is sent to a provider.)

### Verify `TRUST_PROXY_HOPS` (do not skip)

A wrong value puts every user in one rate-limit bucket, so one person can lock out everyone. Test it from two different networks (for example your Wi-Fi and your phone on mobile data):

1. From network A, send more than 60 requests in a minute: `for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code} " RELAY/health; done`. Expect `200` then `429` near the end.
2. Immediately, from network B, run `curl -i RELAY/health`.
   - `200`: correct. Each client has its own bucket.
   - `429`: wrong. All clients share one bucket, so the hop count is too low. Raise `TRUST_PROXY_HOPS` by one in the Render dashboard, redeploy, repeat.
3. If a custom header such as `X-Forwarded-For: 1.2.3.4` sent from network A changes which bucket you land in (a request with a fake value succeeds after you are limited), the count is too high. Lower it by one.

Record the confirmed value in `docs/VERSIONS.md` (it is currently marked unverified).

## 3. Verify the site

Open `SITE/` and `SITE/privacy.html`. Check the install steps read correctly, the privacy page loads and the links between pages work. Note the privacy URL: the store listing needs it.

## 4. Build the release extension

The release build (`WXT_RELEASE=1`, or `wxt zip`) refuses to run without an https, non-localhost relay URL, so a store package cannot ship the dev relay.

PowerShell:
```
$env:WXT_RELEASE="1"; $env:WXT_RELAY_URL="https://slayply-relay.onrender.com"
pnpm install --frozen-lockfile
pnpm --filter @slayply/extension build
pnpm run budget
```
Use your real relay URL. Expect `budget` to report under 3.5 MB (currently about 2.1 MB).

Confirm what was baked in:
```
type apps\extension\.output\chrome-mv3\manifest.json
```
`host_permissions` must contain only your relay origin followed by `/*`, `version` must be `1.0.0`, and `permissions` must be exactly `sidePanel, storage, contextMenus, activeTab, scripting`.

Zip for the store (the folder contents, not the folder itself):
```
cd apps\extension\.output\chrome-mv3
tar -a -c -f ..\slayply-1.0.0.zip *
```

## 5. Extension ID and `EXTENSION_IDS`

The extension carries a fixed public key in its manifest (`apps/extension/src/lib/extension-id.ts`), so Chrome gives it the same ID on every machine and from every folder: `iljnmipngombklkmmjlfgbgdbnagbnbn`. Put that ID in `EXTENSION_IDS` on the relay and every prebuilt download works. A test proves the ID matches the key.

- Only the public key is in the repository; the private key was never saved. That is enough to load the extension; it only matters if you ever want to sign a `.crx` yourself.
- **Chrome Web Store:** the store assigns its own ID unless it accepts the `key` field. This is untested. If you publish there, add the ID shown in the developer dashboard to `EXTENSION_IDS` as well (comma-separated).
- Changing the key changes the ID and strands every installed copy, so do not.

Without the right ID in `EXTENSION_IDS` the panel shows "Origin is not allowed".

## 6. End-to-end test with the release build

Load the release build unpacked (`chrome://extensions` > Developer mode > Load unpacked > `.output/chrome-mv3`).

- [ ] Fresh profile shows the privacy screen first; accepting it reaches Setup.
- [ ] Setup shows relay "Connected" (allow up to a minute on the first call).
- [ ] Paste an API key, pick a provider and model; the model list loads.
- [ ] Capture a job: right-click a selection, and the toolbar icon on a Greenhouse or Lever job page.
- [ ] On a LinkedIn job page the page capture refuses and selecting text works.
- [ ] Generate an answer; it streams, passes the check, and Copy works.
- [ ] Save the job; the Saved tab shows it. Settings export, wipe and import round-trip.
- [ ] Stop the relay (suspend it in Render): the panel says the relay is not responding.
- [ ] Redesign (1.1.0): the app bar chip changes provider, model and effort; the theme button cycles auto, light and dark; the Apply tab moves Capture, Questions, Answers and its main button sits above the tab bar.
- [ ] While a fit check and an answer run, the stage and elapsed time tick and Cancel stops them. On Gemini, note the time the fit check takes (the `BP-fit-timeout` fix is unconfirmed) and whether the relay's keep-alive reaches the panel through Render (the stage must not drop to an error before 2 minutes).
- [ ] Look at all four tabs at 390 x 720 in light and dark.

## 7. Publish and tag

1. Chrome Web Store dashboard: upload the zip, fill the listing from `docs/STORE_LISTING.md`, set the privacy policy URL to `SITE/privacy.html`, and submit for review. Review usually takes days; the `<all_urls>`-like optional `https://*/*` permission may draw questions, and the justification text is in the listing document.
2. Once the store assigns or confirms the ID, make sure it is in `EXTENSION_IDS` (step 5).
3. Tag the release from `main`:
   ```
   git tag -a v1.0.0 -m "Slayply 1.0.0"
   git push origin v1.0.0
   ```
   Use `docs/RELEASE_NOTES_v1.0.0.md` as the GitHub release text.

## Publish a prebuilt download (GitHub release)

The site's download button points at `releases/latest/download/slayply-extension.zip`, so a GitHub release with that file is all it needs.

1. Merge everything for the release to `main`; make sure `apps/extension/package.json` has the version and `docs/RELEASE_NOTES_v<version>.md` exists (a test checks this).
2. Tag and push (this is the only step you run):
   ```
   git tag -a v1.0.0 -m "Slayply 1.0.0"
   git push origin v1.0.0
   ```
3. The **Release** workflow (`.github/workflows/release.yml`) runs the full check, builds the zip against the live relay, writes a SHA-256 file and creates the release with both attached. Watch it under the repository's Actions tab.
4. Check: open `https://github.com/devnadeemashraf/slayply/releases/latest/download/slayply-extension.zip`; it should download. Unzip it, load it unpacked, and confirm the panel says "Connected".
5. A failed workflow publishes nothing. Fix the cause, delete the tag (`git push origin :v1.0.0` and `git tag -d v1.0.0`), and tag again.

To update users: tag a new version. Chrome does not auto-update unpacked extensions; the site and README tell people to download again.

## Rollback

- **Relay:** Render dashboard > the service > Events > roll back to the previous deploy. The extension keeps working with an older relay because the contract is unchanged.
- **Extension:** unpublish or submit a fixed version in the store dashboard. Users keep their local data.
- **Bad `EXTENSION_IDS`:** fix the value in the dashboard; the relay restarts with it.

## Operations

- **Cost:** the free relay sleeps after inactivity, so the first request is slow. It has monthly instance-hour and bandwidth limits; if you outgrow them upgrade the plan or tell users to turn on Direct Mode (Claude only).
- **Logs:** the relay logs one metadata line per request (time, status, latency, provider). It never logs bodies, headers or keys. If you ever see content in the logs, treat it as a security incident (`SECURITY.md`).
- **Updating the relay:** merging to `main` redeploys it automatically if auto-deploy is on. Check `/health` afterwards.
- **Security reports:** arrive through GitHub private vulnerability reporting (enable it in repository settings if you have not).

## Known unverified

These were never tested against live services; the first deploy is where they get tested.

- Render build and start commands, free-tier cold start time, and its SSE timeout behaviour.
- Render's proxy hop count (verified only by the two-network test above).
- OpenAI and Gemini live behaviour (no keys were available): model lists and effort mappings come from id patterns.
- Whether the Chrome Web Store accepts the optional `https://*/*` host permission without extra questions, and whether it accepts a manifest with a `key` field.
- The Release workflow has never run (no tag has been pushed); its first run is its test.
- Linux CI passes the smoke test; a real side panel on your machine is the only check of the panel's look and memory use.
