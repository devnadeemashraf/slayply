import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkBashCommand, checkFilePath, evaluateToolCall } from "./claude-guard.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feature = { currentBranch: "feat/CORE-02-relay" };
const main = { currentBranch: "main" };

test("blocks edits to protected and generated paths", () => {
  for (const file of [
    "docs/SPEC.md",
    "pnpm-lock.yaml",
    "packages/core/dist/index.js",
    "apps/extension/.output/chrome-mv3/manifest.json",
    "temp/context.md",
    ".env",
    "apps/relay/.env.local",
    "keys/server.pem",
  ]) {
    assert.match(checkFilePath(file, ROOT) ?? "", /Blocked/, file);
  }
});

test("allows ordinary source, docs and .env.example", () => {
  for (const file of [
    "packages/core/src/schema.ts",
    "docs/ROADMAP.md",
    "README.md",
    "apps/relay/.env.example",
  ]) {
    assert.equal(checkFilePath(file, ROOT), null, file);
  }
});

test("normalizes absolute, backslash and dot-segment paths", () => {
  assert.match(checkFilePath(path.join(ROOT, "docs", "SPEC.md"), ROOT) ?? "", /Blocked/);
  assert.match(checkFilePath("docs\\SPEC.md", ROOT) ?? "", /Blocked/);
  assert.match(checkFilePath("packages\\core\\dist\\index.js", ROOT) ?? "", /Blocked/);
  assert.match(checkFilePath("packages/core/../../docs/SPEC.md", ROOT) ?? "", /Blocked/);
});

test("does not police paths outside the repository", () => {
  assert.equal(checkFilePath(path.join(ROOT, "..", "elsewhere", "docs", "SPEC.md"), ROOT), null);
});

test("blocks pushes to main in every spelling", () => {
  for (const cmd of [
    "git push origin main",
    "git push origin HEAD:main",
    "git push origin HEAD:refs/heads/main",
    "git push -u origin master",
    "git add . && git push origin main",
  ]) {
    assert.match(checkBashCommand(cmd, feature) ?? "", /Blocked/, cmd);
  }
});

test("blocks force pushes on any branch", () => {
  for (const cmd of [
    "git push --force origin feat/x",
    "git push -f origin feat/x",
    "git push --force-with-lease origin feat/x",
  ]) {
    assert.match(checkBashCommand(cmd, feature) ?? "", /force-push/, cmd);
  }
});

test("allows pushing a feature branch", () => {
  assert.equal(checkBashCommand("git push -u origin feat/CORE-02-relay", feature), null);
  assert.equal(checkBashCommand("git push", feature), null);
});

test("blocks commits and bare pushes while on main", () => {
  assert.match(checkBashCommand('git commit -m "fix: x"', main) ?? "", /Blocked/);
  assert.match(checkBashCommand("git push", main) ?? "", /Blocked/);
  assert.equal(checkBashCommand('git commit -m "fix: x"', feature), null);
});

test("blocks merging PRs, and merges into main", () => {
  assert.match(checkBashCommand("gh pr merge 3 --squash", feature) ?? "", /never merge/);
  assert.match(checkBashCommand("git merge feat/x", main) ?? "", /Blocked/);
  assert.equal(checkBashCommand("git merge origin/main", feature), null);
});

test("requires a POINTER update before opening a PR", () => {
  const withoutPointer = { ...feature, changedFiles: ["packages/core/src/a.ts"] };
  const withPointer = { ...feature, changedFiles: ["packages/core/src/a.ts", "docs/POINTER.md"] };
  assert.match(checkBashCommand("gh pr create --title x", withoutPointer) ?? "", /POINTER/);
  assert.equal(checkBashCommand("gh pr create --title x", withPointer), null);
});

test("ignores harmless commands and text that merely mentions git", () => {
  assert.equal(checkBashCommand("pnpm run check", feature), null);
  assert.equal(checkBashCommand('echo "do not git push origin main"', feature), null);
  assert.equal(checkBashCommand(undefined, feature), null);
});

test("evaluateToolCall routes by tool and tolerates malformed input", () => {
  assert.match(
    evaluateToolCall({ tool_name: "Edit", cwd: ROOT, tool_input: { file_path: "docs/SPEC.md" } }) ??
      "",
    /Blocked/,
  );
  assert.match(
    evaluateToolCall(
      { tool_name: "Bash", tool_input: { command: "git push origin main" } },
      feature,
    ) ?? "",
    /Blocked/,
  );
  for (const input of [undefined, null, {}, { tool_name: "Read" }, { tool_input: "x" }]) {
    assert.equal(evaluateToolCall(input, feature), null);
  }
});

test("CLI exits 2 with the reason on stderr for a blocked call", () => {
  const result = spawnSync("node", ["scripts/claude-guard.mjs", "pre-tool"], {
    cwd: ROOT,
    input: JSON.stringify({
      tool_name: "Write",
      cwd: ROOT,
      tool_input: { file_path: "docs/SPEC.md" },
    }),
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Spec change proposal/);
});

test("CLI exits 0 for an allowed call and for garbage stdin", () => {
  const run = (input) =>
    spawnSync("node", ["scripts/claude-guard.mjs", "pre-tool"], {
      cwd: ROOT,
      input,
      encoding: "utf8",
    });
  assert.equal(
    run(JSON.stringify({ tool_name: "Edit", cwd: ROOT, tool_input: { file_path: "README.md" } }))
      .status,
    0,
  );
  assert.equal(run("not json").status, 0);
});

test("session-start prints the pointer", () => {
  const result = spawnSync("node", ["scripts/claude-guard.mjs", "session-start"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /FIX-FIRST QUEUE/);
});
