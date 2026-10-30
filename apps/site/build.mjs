import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Copies the hand-written pages to dist/. No bundler: the site is plain HTML and CSS. */
export function buildSite(srcDir = path.join(root, "src"), outDir = path.join(root, "dist")) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(srcDir, outDir, { recursive: true });
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`site built to ${buildSite()}`);
}
