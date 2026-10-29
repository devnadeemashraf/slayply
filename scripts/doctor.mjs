#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** Parses "v24.21.0", "git version 2.53.0.windows.2", "Version: 2.6.3" into [major, minor, patch]. */
export function parseVersion(raw) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(raw));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Returns a negative, zero or positive number like a comparator; null when either side is unparseable. */
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

function readPins(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  return {
    node: manifest.engines?.node?.replace(/^>=/, ""),
    pnpm: manifest.engines?.pnpm?.replace(/^>=/, ""),
    turbo: manifest.devDependencies?.turbo,
    biome: manifest.devDependencies?.["@biomejs/biome"],
    typescript: manifest.devDependencies?.typescript,
  };
}

/**
 * Validates the local toolchain against the pins in package.json (see docs/VERSIONS.md).
 * `execFn` and `nodeVersion` are injectable so the checks stay hermetic under test.
 */
export function checkEnvironment(options = {}) {
  const root = options.root ?? process.cwd();
  const exec = options.execFn ?? execSync;
  const pins = options.pins ?? readPins(root);
  const results = [];

  const run = (cmd) => exec(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

  const record = (tool, pinned, detect, isPassing) => {
    let detected;
    let passed = false;
    try {
      detected = detect();
      passed = isPassing(detected);
    } catch (err) {
      detected = `Error: ${err.message}`;
    }
    results.push({ tool, pinned, detected, passed });
  };

  const atLeast = (pin) => (detected) => (compareVersions(detected, pin) ?? -1) >= 0;
  const exactly = (pin) => (detected) => compareVersions(detected, pin) === 0;

  record(
    "Node.js",
    `>=${pins.node}`,
    () => options.nodeVersion ?? process.version,
    atLeast(pins.node),
  );
  record("pnpm", `>=${pins.pnpm}`, () => run("pnpm --version"), atLeast(pins.pnpm));
  record("Git", ">=2.50.0", () => run("git --version"), atLeast("2.50.0"));
  record("turbo", pins.turbo, () => run("pnpm exec turbo --version"), exactly(pins.turbo));
  record("Biome", pins.biome, () => run("pnpm exec biome --version"), exactly(pins.biome));
  record(
    "TypeScript",
    pins.typescript,
    () => run("pnpm exec tsc --version"),
    exactly(pins.typescript),
  );
  record(
    "VERSIONS.md",
    "present",
    () => {
      const present =
        options.versionsDocExists ?? fs.existsSync(path.join(root, "docs", "VERSIONS.md"));
      return present ? "present" : "missing";
    },
    (detected) => detected === "present",
  );

  return { results, allPassed: results.every((r) => r.passed) };
}

if (import.meta.main) {
  console.log("=== Slayply Doctor: validating toolchain against package.json pins ===\n");
  const { results, allPassed } = checkEnvironment();

  for (const item of results) {
    const symbol = item.passed ? "PASS" : "FAIL";
    console.log(
      `[${symbol}] ${item.tool.padEnd(11)} detected ${item.detected} (pinned ${item.pinned})`,
    );
  }

  if (!allPassed) {
    console.error("\nToolchain mismatch. See docs/VERSIONS.md and docs/SETUP.md.");
    process.exit(1);
  }
  console.log("\nAll pins satisfied.");
}
