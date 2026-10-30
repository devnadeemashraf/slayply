#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// SPEC §5: the extension stays under 3.5 MB uncompressed.
export const BUDGET_BYTES = 3.5 * 1024 * 1024;
export const DEFAULT_DIR = "apps/extension/.output/chrome-mv3";

/** Total size in bytes of every file under `dir`; throws when `dir` is missing or empty. */
export function measureDir(dir) {
  if (!fs.existsSync(dir)) throw new Error(`${dir} does not exist; build the extension first`);
  let total = 0;
  let files = 0;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        total += fs.statSync(full).size;
        files += 1;
      }
    }
  };
  walk(dir);
  if (files === 0) throw new Error(`${dir} has no files; build the extension first`);
  return { bytes: total, files };
}

export function checkBudget(bytes, budget = BUDGET_BYTES) {
  return { ok: bytes <= budget, bytes, budget };
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? DEFAULT_DIR;
  try {
    const { bytes, files } = measureDir(dir);
    const result = checkBudget(bytes);
    console.log(`${dir}: ${files} files, ${mb(bytes)} MB of ${mb(result.budget)} MB`);
    if (!result.ok) {
      console.error("Extension is over the bundle size budget (SPEC §5).");
      process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
