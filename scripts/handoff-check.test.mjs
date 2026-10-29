import assert from "node:assert/strict";
import test from "node:test";
import { checkHandoffCompliance, evaluateChanges, validatePointerDoc } from "./handoff-check.mjs";

const VALID_POINTER = [
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

const entry = (status, file) => ({ status, file });

test("accepts a well-formed POINTER.md", () => {
  const result = validatePointerDoc(VALID_POINTER);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("flags missing required headings", () => {
  const result = validatePointerDoc("# Slayply AI Handoff Pointer\n## State\n- Working");
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("missing required heading")));
});

test("does not accept a heading that only appears inside prose", () => {
  const sneaky = VALID_POINTER.replace("## Learning", "see ## Learning later");
  assert.equal(validatePointerDoc(sneaky).valid, false);
});

test("allows exactly 80 lines and rejects 81", () => {
  const pad = (total) =>
    `${VALID_POINTER}\n${Array(total - 15)
      .fill("x")
      .join("\n")}`;
  assert.equal(validatePointerDoc(pad(80)).valid, true);
  const over = validatePointerDoc(pad(81));
  assert.equal(over.valid, false);
  assert.ok(over.errors.some((e) => e.includes("at most 80")));
});

test("rejects non-string input", () => {
  for (const input of [null, undefined, 12345, {}, []]) {
    assert.equal(validatePointerDoc(input).valid, false);
  }
});

test("requires a POINTER update when code changes", () => {
  const errors = evaluateChanges([entry("M", "apps/relay/src/index.ts")]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /POINTER\.md was not updated/);
});

test("passes when docs-only changes skip POINTER", () => {
  assert.deepEqual(evaluateChanges([entry("M", "docs/SPEC.md")]), []);
});

test("passes when code and POINTER change together", () => {
  assert.deepEqual(
    evaluateChanges([entry("M", "packages/core/src/schema.ts"), entry("M", "docs/POINTER.md")]),
    [],
  );
});

test("requires HANDBOOK when a new source module is added", () => {
  const errors = evaluateChanges([
    entry("A", "packages/core/src/prompt.ts"),
    entry("M", "docs/POINTER.md"),
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /HANDBOOK\.md was not updated/);
});

test("does not require HANDBOOK for modified files or new tests", () => {
  assert.deepEqual(
    evaluateChanges([
      entry("M", "packages/core/src/schema.ts"),
      entry("A", "packages/core/src/schema.test.ts"),
      entry("M", "docs/POINTER.md"),
    ]),
    [],
  );
});

test("accepts a new module when HANDBOOK is also updated", () => {
  assert.deepEqual(
    evaluateChanges([
      entry("A", "apps/relay/src/server.ts"),
      entry("M", "docs/POINTER.md"),
      entry("M", "docs/HANDBOOK.md"),
    ]),
    [],
  );
});

test("CI mode parses git name-status output, including renames", () => {
  const result = checkHandoffCompliance({
    isCI: true,
    execSync: () => "A\tpackages/core/src/a.ts\nR100\told.ts\tdocs/POINTER.md\nM\tdocs/HANDBOOK.md",
  });
  assert.equal(result.valid, true);
});

test("CI mode fails closed when the diff cannot be computed", () => {
  const result = checkHandoffCompliance({
    isCI: true,
    execSync: () => {
      throw new Error("fatal: bad revision");
    },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /cannot be verified/);
});

test("the repository's own POINTER.md is valid", () => {
  const result = checkHandoffCompliance({ isCI: false });
  assert.equal(result.valid, true);
  assert.ok(result.lineCount <= 80);
});
