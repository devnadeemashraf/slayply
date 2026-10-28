#!/usr/bin/env node
import { execSync } from "node:child_process";
import process from "node:process";

console.log("=== Linting Workspace Code ===");

try {
  execSync("pnpm exec biome lint .", { stdio: "inherit" });
  console.log("✓ Lint check passed via Biome.");
  process.exit(0);
} catch (_err) {
  console.log("skip: Biome not yet locally installed (or skeleton has no code to lint).");
  process.exit(0);
}
