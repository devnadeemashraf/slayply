#!/usr/bin/env node
import { execSync } from "node:child_process";
import process from "node:process";

console.log("=== Formatting Workspace Files ===");

try {
  execSync("pnpm exec biome format --write .", { stdio: "inherit" });
  console.log("✓ Formatting completed via Biome.");
  process.exit(0);
} catch (_err) {
  console.log("skip: Biome not yet locally installed. Run 'pnpm install' to install Biome.");
  process.exit(0);
}
