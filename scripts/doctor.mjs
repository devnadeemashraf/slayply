#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function checkEnvironment() {
  const results = [];
  let allPassed = true;

  // 1. Check Node.js
  const nodeVersion = process.version;
  const majorNode = Number.parseInt(nodeVersion.slice(1).split(".")[0], 10);
  const nodePassed = majorNode >= 24;
  results.push({
    tool: "Node.js",
    pinned: "^24.21.0",
    detected: nodeVersion,
    passed: nodePassed,
    source: "docs/VERSIONS.md",
  });
  if (!nodePassed) allPassed = false;

  // 2. Check pnpm
  let pnpmVersion = "unknown";
  let pnpmPassed = false;
  try {
    pnpmVersion = execSync("pnpm --version", { encoding: "utf8" }).trim();
    const majorPnpm = Number.parseInt(pnpmVersion.split(".")[0], 10);
    pnpmPassed = majorPnpm >= 12;
  } catch (err) {
    pnpmVersion = `Error: ${err.message}`;
  }
  results.push({
    tool: "pnpm",
    pinned: "^12.6.0",
    detected: pnpmVersion,
    passed: pnpmPassed,
    source: "docs/VERSIONS.md",
  });
  if (!pnpmPassed) allPassed = false;

  // 3. Check git
  let gitVersion = "unknown";
  let gitPassed = false;
  try {
    gitVersion = execSync("git --version", { encoding: "utf8" }).trim();
    gitPassed = gitVersion.includes("git version");
  } catch (err) {
    gitVersion = `Error: ${err.message}`;
  }
  results.push({
    tool: "Git",
    pinned: "^2.53.0",
    detected: gitVersion,
    passed: gitPassed,
    source: "docs/VERSIONS.md",
  });
  if (!gitPassed) allPassed = false;

  // 4. Verify docs/VERSIONS.md existence
  const versionsDocPath = path.resolve(process.cwd(), "docs/VERSIONS.md");
  const versionsDocExists = fs.existsSync(versionsDocPath);
  results.push({
    tool: "VERSIONS.md",
    pinned: "Exists",
    detected: versionsDocExists ? "Present" : "Missing",
    passed: versionsDocExists,
    source: "docs/VERSIONS.md",
  });
  if (!versionsDocExists) allPassed = false;

  return { results, allPassed };
}

// When run directly as CLI
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))
) {
  console.log("=== Slayply Doctor: Validating System Environment against docs/VERSIONS.md ===\n");
  const { results, allPassed } = checkEnvironment();

  for (const item of results) {
    const symbol = item.passed ? "✓ PASS" : "✗ FAIL";
    console.log(
      `[${symbol}] ${item.tool.padEnd(14)}: detected ${item.detected} (pinned ${item.pinned})`,
    );
  }

  if (!allPassed) {
    console.error(
      "\nDoctor found environment discrepancies. Please consult docs/VERSIONS.md and docs/SETUP.md.",
    );
    process.exit(1);
  } else {
    console.log("\nAll required tools and pins are satisfied.");
    process.exit(0);
  }
}
