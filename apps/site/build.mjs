import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

const THEME_FILE = path.join(root, "../../packages/ui/src/theme.css");

/**
 * Copies the hand-written pages to dist/ with the side panel's theme tokens beside them, so the
 * site and the extension share one palette. No bundler: the site is plain HTML and CSS.
 */
export function buildSite(srcDir = path.join(root, "src"), outDir = path.join(root, "dist")) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(srcDir, outDir, { recursive: true });
  fs.copyFileSync(THEME_FILE, path.join(outDir, "theme.css"));
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`site built to ${buildSite()}`);
}
