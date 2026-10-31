#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// SPEC §5: the side panel stays under 60 MB. Chrome has no public per-panel process figure from
// automation, so the recorded number is the page's JS heap (the part we control); it understates
// the whole process, which is why the gate is a tripwire and not a full footprint measure.
export const PANEL_HEAP_BUDGET_BYTES = 60 * 1024 * 1024;
const DEFAULT_DIR = "apps/extension/.output/chrome-mv3";

/** Loads the built extension, opens the panel page and returns what it saw. */
export async function runSmoke(extensionDir) {
  const manifest = path.join(extensionDir, "manifest.json");
  if (!fs.existsSync(manifest)) throw new Error(`${manifest} not found; build the extension first`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slayply-smoke-"));
  const context = await chromium.launchPersistentContext(profile, {
    // Extensions do not load in the old headless mode, so ask for the new one explicitly.
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${path.resolve(extensionDir)}`,
      `--load-extension=${path.resolve(extensionDir)}`,
    ],
  });
  try {
    let worker = context.serviceWorkers()[0];
    worker ??= await context.waitForEvent("serviceworker", { timeout: 15_000 });
    const extensionId = new URL(worker.url()).host;

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    // A fresh profile has not accepted the privacy notice, so the gate is what must render.
    await page.getByText("Where your data goes").waitFor({ timeout: 15_000 });
    await page.waitForFunction(() => (document.body.textContent ?? "").trim().length > 0, null, {
      timeout: 15_000,
    });
    const text = await page.evaluate(() => document.body.textContent);

    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const { metrics } = await cdp.send("Performance.getMetrics");
    const heap = metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? Number.NaN;

    return { extensionId, text, heapBytes: heap, errors };
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSmoke(process.argv[2] ?? DEFAULT_DIR);
    const mb = (result.heapBytes / 1024 / 1024).toFixed(1);
    console.log(`extension ${result.extensionId}: panel rendered ${result.text.length} characters`);
    console.log(`panel JS heap: ${mb} MB of 60 MB`);
    if (result.errors.length > 0) {
      console.error(`panel threw: ${result.errors.join("; ")}`);
      process.exit(1);
    }
    // The relay only accepts the ID in lib/extension-id.ts, so a load from any folder must get it.
    const pinned = /EXTENSION_ID = "([a-p]{32})"/.exec(
      fs.readFileSync("apps/extension/src/lib/extension-id.ts", "utf8"),
    )?.[1];
    if (result.extensionId !== pinned) {
      console.error(`Extension loaded as ${result.extensionId}, expected the pinned ${pinned}.`);
      process.exit(1);
    }
    if (!result.text.includes("Where your data goes")) {
      console.error("Panel did not show the privacy gate on a fresh profile.");
      process.exit(1);
    }
    if (!(result.heapBytes <= PANEL_HEAP_BUDGET_BYTES)) {
      console.error("Panel is over the memory budget (SPEC §5).");
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
