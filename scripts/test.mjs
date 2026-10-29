#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

const steps = [
  { name: "tooling scripts", cmd: 'node --test "scripts/*.test.mjs"' },
  { name: "workspace packages", cmd: "pnpm exec turbo run test" },
];

for (const step of steps) {
  console.log(`\n> ${step.name}: ${step.cmd}`);
  const { status } = spawnSync(step.cmd, { stdio: "inherit", shell: true });
  if (status !== 0) {
    console.error(`\n${step.name} failed.`);
    process.exit(status ?? 1);
  }
}
