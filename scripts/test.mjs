#!/usr/bin/env node
import { execSync } from "node:child_process";
import process from "node:process";

console.log("=== Running Workspace Tests ===");

// 1. Run script unit tests using Node built-in test runner
try {
  console.log("> Running tooling scripts tests (node --test scripts/*.test.mjs)...");
  execSync("node --test scripts/doctor.test.mjs scripts/handoff-check.test.mjs", {
    stdio: "inherit",
  });
  console.log("✓ Tooling script tests passed.");
} catch (_err) {
  console.error("✗ Tooling script tests failed.");
  process.exit(1);
}

// 2. Run workspace package tests via Turborepo
console.log("\n> Running workspace package tests via Turborepo (turbo run test)...");
try {
  execSync("pnpm exec turbo run test", {
    stdio: "inherit",
  });
  console.log("✓ Workspace package tests passed via Turborepo.");
} catch (_err) {
  console.error("✗ Workspace package tests failed via Turborepo.");
  process.exit(1);
}

console.log("\n✓ All tests passed or cleanly skipped on skeleton.");
process.exit(0);
