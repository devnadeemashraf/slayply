#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

// Renders apps/extension/public/icon/icon.svg to the PNG sizes the manifest and the Web Store need.
// Run by hand after editing the SVG; the PNGs are committed.
const SIZES = [16, 32, 48, 96, 128];
const dir = process.argv[2] ?? "apps/extension/public/icon";
const svg = fs.readFileSync(path.join(dir, "icon.svg"), "utf8");

const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg.replace(
        /width="128" height="128"/,
        `width="${size}" height="${size}"`,
      )}</div></body>`,
    );
    await page.screenshot({
      path: path.join(dir, `${size}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`wrote ${SIZES.map((size) => `${size}.png`).join(", ")} to ${dir}`);
