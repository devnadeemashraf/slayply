#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

// Everything CI runs, in cheapest-first order. Stops at the first failure.
const tasks = [
  { name: "doctor", cmd: "pnpm run doctor" },
  { name: "handoff", cmd: "pnpm run handoff:check" },
  { name: "format", cmd: "pnpm run fmt:check" },
  { name: "lint", cmd: "pnpm run lint" },
  { name: "test", cmd: "pnpm run test" },
  { name: "typecheck", cmd: "pnpm exec turbo run typecheck" },
];

for (const task of tasks) {
  console.log(`\n--- ${task.name}: ${task.cmd} ---`);
  const { status } = spawnSync(task.cmd, { stdio: "inherit", shell: true });
  if (status !== 0) {
    console.error(`\ncheck failed at [${task.name}].`);
    process.exit(status ?? 1);
  }
}

console.log("\ncheck passed.");
