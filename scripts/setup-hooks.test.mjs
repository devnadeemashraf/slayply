import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setupHooks } from "./setup-hooks.mjs";

function makeRoot({ git = true, hooks = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slayply-hooks-"));
  if (git) fs.mkdirSync(path.join(root, ".git"));
  if (hooks) fs.mkdirSync(path.join(root, ".githooks"));
  return root;
}

test("configures core.hooksPath inside a git checkout", () => {
  const calls = [];
  const result = setupHooks({ root: makeRoot(), execFn: (cmd) => calls.push(cmd) });
  assert.equal(result.installed, true);
  assert.deepEqual(calls, ["git config core.hooksPath .githooks"]);
});

test("is a no-op outside a git checkout", () => {
  const result = setupHooks({
    root: makeRoot({ git: false }),
    execFn: () => assert.fail("must not call git"),
  });
  assert.equal(result.installed, false);
});

test("is a no-op when the hooks directory is missing", () => {
  const result = setupHooks({
    root: makeRoot({ hooks: false }),
    execFn: () => assert.fail("must not call git"),
  });
  assert.equal(result.installed, false);
});

test("never throws when git itself fails (must not break pnpm install)", () => {
  const result = setupHooks({
    root: makeRoot(),
    execFn: () => {
      throw new Error("git not found");
    },
  });
  assert.equal(result.installed, false);
  assert.match(result.reason, /git not found/);
});
