#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const HOOKS_DIR = ".githooks";

/**
 * Points git at the tracked hooks directory. Runs from `pnpm install` (prepare), so it must
 * never fail an install: outside a git checkout (tarball, Docker layer) it is a no-op.
 */
export function setupHooks(options = {}) {
  const root = options.root ?? process.cwd();
  const exec = options.execFn ?? execSync;

  if (!fs.existsSync(path.join(root, ".git"))) {
    return { installed: false, reason: "not a git checkout" };
  }
  if (!fs.existsSync(path.join(root, HOOKS_DIR))) {
    return { installed: false, reason: `${HOOKS_DIR} directory is missing` };
  }

  try {
    exec(`git config core.hooksPath ${HOOKS_DIR}`, { cwd: root, stdio: "ignore" });
  } catch (err) {
    return { installed: false, reason: `git config failed: ${err.message}` };
  }
  return { installed: true };
}

if (import.meta.main) {
  const result = setupHooks();
  console.log(result.installed ? "git hooks installed" : `skip: git hooks (${result.reason})`);
}
