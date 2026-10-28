#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function validatePointerDoc(pointerContent) {
  const errors = [];
  if (typeof pointerContent !== "string") {
    return { valid: false, errors: ["POINTER.md content must be a string."], lineCount: 0 };
  }

  const lines = pointerContent.split(/\r?\n/);

  if (lines.length > 80) {
    errors.push(`POINTER.md is ${lines.length} lines (must be at most 80 lines).`);
  }

  const requiredHeadings = [
    "## State",
    "## FIX-FIRST QUEUE",
    "## NEXT UP",
    "## Open questions for the human",
    "## Environment notes and gotchas",
    "## Learning",
    "## Recent history",
  ];

  for (const heading of requiredHeadings) {
    if (!pointerContent.includes(heading)) {
      errors.push(`POINTER.md is missing required heading: '${heading}'.`);
    }
  }

  return { valid: errors.length === 0, errors, lineCount: lines.length };
}

export function checkHandoffCompliance(options = {}) {
  const pointerPath = options.pointerPath || path.resolve(process.cwd(), "docs/POINTER.md");
  if (!fs.existsSync(pointerPath)) {
    return { valid: false, errors: ["docs/POINTER.md does not exist."] };
  }

  const pointerContent = fs.readFileSync(pointerPath, "utf8");
  const validation = validatePointerDoc(pointerContent);
  if (!validation.valid) {
    return validation;
  }

  // Check git diff if git is present and in CI / PR context
  const isCI = options.isCI ?? Boolean(process.env.CI);
  if (isCI) {
    const exec = options.execSync || execSync;
    try {
      const baseRef = process.env.GITHUB_BASE_REF
        ? `origin/${process.env.GITHUB_BASE_REF}`
        : "origin/main";
      let changedFiles = "";
      try {
        changedFiles = exec(`git diff --name-only ${baseRef}...HEAD`, { encoding: "utf8" }).trim();
      } catch (_e) {
        changedFiles = exec("git diff --name-only HEAD~1", { encoding: "utf8" }).trim();
      }

      if (changedFiles) {
        const fileList = changedFiles
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const codeFilesChanged = fileList.some(
          (f) => f.startsWith("apps/") || f.startsWith("packages/") || f.startsWith("scripts/"),
        );
        const pointerChanged = fileList.includes("docs/POINTER.md");
        if (codeFilesChanged && !pointerChanged) {
          return {
            valid: false,
            errors: ["Code files were modified but docs/POINTER.md was not updated."],
            lineCount: validation.lineCount,
          };
        }
      }
    } catch (_err) {
      // If git diff fails (e.g. initial shallow clone), structure validation still holds
    }
  }

  return { valid: true, errors: [], lineCount: validation.lineCount };
}

// When run directly as CLI
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))
) {
  console.log("=== Slayply Handoff Guard: Validating docs/POINTER.md ===\n");
  const result = checkHandoffCompliance();

  if (!result.valid) {
    console.error("Handoff validation failed:");
    for (const err of result.errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`✓ docs/POINTER.md is valid (${result.lineCount}/80 lines, all headings verified).`);
  process.exit(0);
}
