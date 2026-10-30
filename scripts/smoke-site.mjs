#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const DEFAULT_DIR = "apps/site/dist";

/** Opens the built landing page in Chromium, follows the privacy link and returns what it saw. */
export async function runSiteSmoke(siteDir) {
  if (!fs.existsSync(path.join(siteDir, "index.html"))) {
    throw new Error(`${siteDir}/index.html not found; build the site first`);
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => errors.push(`failed: ${request.url()}`));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
    });
    await page.goto(pathToFileURL(path.resolve(siteDir, "index.html")).href);
    const heading = await page.locator("h1").textContent();
    await page.getByRole("link", { name: "Privacy details" }).click();
    await page.waitForURL(/privacy\.html$/);
    const privacyHeading = await page.locator("h1").textContent();
    return { heading, privacyHeading, errors };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runSiteSmoke(process.argv[2] ?? DEFAULT_DIR);
    console.log(`landing page: "${result.heading}"; privacy page: "${result.privacyHeading}"`);
    if (result.privacyHeading !== "Privacy" || result.errors.length > 0) {
      console.error(`site smoke failed: ${result.errors.join("; ") || "privacy page not reached"}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
