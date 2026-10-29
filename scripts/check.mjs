#!/usr/bin/env node
import { execSync } from "node:child_process";
import process from "node:process";

console.log("=================================================");
console.log("       SLAYPLY FULL CI & WORKSPACE CHECK        ");
console.log("=================================================\n");

const tasks = [
  { name: "Doctor (Environment Pins)", cmd: "node scripts/doctor.mjs" },
  { name: "Handoff Guard (docs/POINTER.md)", cmd: "node scripts/handoff-check.mjs" },
  { name: "Format Check", cmd: "node scripts/fmt-check.mjs" },
  { name: "Lint Check", cmd: "node scripts/lint.mjs" },
  { name: "Workspace & Tooling Tests", cmd: "node scripts/test.mjs" },
  { name: "Turborepo Workspace Pipeline Check", cmd: "pnpm exec turbo run check" },
];

let failed = false;

for (const task of tasks) {
  console.log(`\n--- Running [${task.name}] ---`);
  try {
    execSync(task.cmd, { stdio: "inherit" });
  } catch (_err) {
    console.error(`\n✗ [${task.name}] failed.`);
    failed = true;
    break;
  }
}

console.log("\n=================================================");
if (failed) {
  console.error("CHECK SUITE FAILED. Fix issues above before committing.");
  process.exit(1);
} else {
  console.log("CHECK SUITE PASSED. All tasks green on skeleton.");
  console.log("=================================================\n");
  process.exit(0);
}
