#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const MAX_POINTER_LINES = 80;

const REQUIRED_HEADINGS = [
  "## State",
  "## FIX-FIRST QUEUE",
  "## NEXT UP",
  "## Open questions for the human",
  "## Environment notes and gotchas",
  "## Learning",
  "## Recent history",
];

const CODE_PREFIXES = ["apps/", "packages/", "scripts/"];
const MODULE_SOURCE = /^(apps|packages)\/[^/]+\/src\/.+\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

export function validatePointerDoc(pointerContent) {
  if (typeof pointerContent !== "string") {
    return { valid: false, errors: ["POINTER.md content must be a string."], lineCount: 0 };
  }

  const errors = [];
  const lines = pointerContent.replace(/\n$/, "").split(/\r?\n/);

  if (lines.length > MAX_POINTER_LINES) {
    errors.push(`POINTER.md is ${lines.length} lines (must be at most ${MAX_POINTER_LINES}).`);
  }

  for (const heading of REQUIRED_HEADINGS) {
    if (!lines.some((line) => line.trim() === heading)) {
      errors.push(`POINTER.md is missing required heading: '${heading}'.`);
    }
  }

  return { valid: errors.length === 0, errors, lineCount: lines.length };
}

/**
 * Applies the handoff rules to a list of `{ status, file }` diff entries:
 * code changed => POINTER changed; a new source module added => HANDBOOK changed.
 */
export function evaluateChanges(entries) {
  const errors = [];
  const files = new Set(entries.map((e) => e.file));

  const codeChanged = entries.some((e) =>
    CODE_PREFIXES.some((prefix) => e.file.startsWith(prefix)),
  );
  if (codeChanged && !files.has("docs/POINTER.md")) {
    errors.push("Code files were modified but docs/POINTER.md was not updated.");
  }

  const newModule = entries.some(
    (e) => e.status === "A" && MODULE_SOURCE.test(e.file) && !TEST_FILE.test(e.file),
  );
  if (newModule && !files.has("docs/HANDBOOK.md")) {
    errors.push("A new source module was added but docs/HANDBOOK.md was not updated.");
  }

  return errors;
}

function parseNameStatus(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      // Renames/copies report "R100\told\tnew"; the destination is the file that matters.
      return { status: status.charAt(0), file: rest[rest.length - 1] };
    });
}

function readChangedEntries(exec) {
  const baseRef = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : "origin/main";
  try {
    return parseNameStatus(exec(`git diff --name-status ${baseRef}...HEAD`, { encoding: "utf8" }));
  } catch {
    // No merge base (shallow clone, first push): fall back to the last commit.
    return parseNameStatus(exec("git diff --name-status HEAD~1", { encoding: "utf8" }));
  }
}

export function checkHandoffCompliance(options = {}) {
  const pointerPath = options.pointerPath ?? path.resolve(process.cwd(), "docs/POINTER.md");
  if (!fs.existsSync(pointerPath)) {
    return { valid: false, errors: ["docs/POINTER.md does not exist."], lineCount: 0 };
  }

  const validation = validatePointerDoc(fs.readFileSync(pointerPath, "utf8"));
  if (!validation.valid) return validation;

  const isCI = options.isCI ?? Boolean(process.env.CI);
  if (!isCI) return validation;

  let entries;
  try {
    entries = readChangedEntries(options.execSync ?? execSync);
  } catch (err) {
    return {
      valid: false,
      errors: [
        `Could not compute the PR diff, so the handoff rules cannot be verified: ${err.message}`,
      ],
      lineCount: validation.lineCount,
    };
  }

  const errors = evaluateChanges(entries);
  return { valid: errors.length === 0, errors, lineCount: validation.lineCount };
}

if (import.meta.main) {
  console.log("=== Slayply Handoff Guard ===\n");
  const result = checkHandoffCompliance();

  if (!result.valid) {
    console.error("Handoff validation failed:");
    for (const err of result.errors) console.error(`- ${err}`);
    process.exit(1);
  }

  console.log(`docs/POINTER.md is valid (${result.lineCount}/${MAX_POINTER_LINES} lines).`);
}
