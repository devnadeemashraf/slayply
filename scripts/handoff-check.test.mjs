import assert from "node:assert/strict";
import test from "node:test";
import { checkHandoffCompliance, validatePointerDoc } from "./handoff-check.mjs";

test("validates valid POINTER.md content", () => {
  const validContent = [
    "# Slayply AI Handoff Pointer",
    "## State",
    "- Working",
    "## FIX-FIRST QUEUE",
    "- None",
    "## NEXT UP",
    "- Next task",
    "## Open questions for the human",
    "- None",
    "## Environment notes and gotchas",
    "- None",
    "## Learning",
    "- Inactive",
    "## Recent history",
    "- PR #1",
  ].join("\n");

  const result = validatePointerDoc(validContent);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("flags POINTER.md missing required headings", () => {
  const invalidContent = ["# Slayply AI Handoff Pointer", "## State", "- Working"].join("\n");

  const result = validatePointerDoc(invalidContent);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("missing required heading")));
});

test("flags POINTER.md exceeding 80 lines", () => {
  const longContent = Array(85).fill("line").join("\n");
  const result = validatePointerDoc(longContent);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("at most 80 lines")));
});

test("handles non-string input safely (malicious/edge input)", () => {
  assert.equal(validatePointerDoc(null).valid, false);
  assert.equal(validatePointerDoc(undefined).valid, false);
  assert.equal(validatePointerDoc(12345).valid, false);
  assert.equal(validatePointerDoc({}).valid, false);
});

test("enforces POINTER.md update when code files are modified in CI context", () => {
  const result = checkHandoffCompliance({
    isCI: true,
    execSync: (cmd) => {
      if (cmd.includes("git diff")) {
        return "apps/relay/src/index.ts\npackages/core/src/index.ts";
      }
      return "";
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("docs/POINTER.md was not updated")));
});

test("allows code changes when POINTER.md is also updated in CI context", () => {
  const result = checkHandoffCompliance({
    isCI: true,
    execSync: (cmd) => {
      if (cmd.includes("git diff")) {
        return "apps/relay/src/index.ts\ndocs/POINTER.md";
      }
      return "";
    },
  });
  assert.equal(result.valid, true);
});

test("checkHandoffCompliance passes on actual repository docs/POINTER.md", () => {
  const result = checkHandoffCompliance();
  assert.equal(result.valid, true);
  assert.ok(result.lineCount <= 80);
});
