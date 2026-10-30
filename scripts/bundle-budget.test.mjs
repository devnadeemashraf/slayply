import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BUDGET_BYTES, checkBudget, measureDir } from "./bundle-budget.mjs";

const script = fileURLToPath(new URL("./bundle-budget.mjs", import.meta.url));

function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slayply-budget-"));
  for (const [name, size] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.alloc(size));
  }
  return dir;
}

test("sums files in nested folders", () => {
  const dir = fixture({ "a.js": 100, "chunks/b.js": 250 });
  assert.deepEqual(measureDir(dir), { bytes: 350, files: 2 });
});

test("a missing or empty folder is an error, not a pass", () => {
  assert.throws(() => measureDir(path.join(os.tmpdir(), "slayply-no-such-dir")), /build/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "slayply-budget-"));
  assert.throws(() => measureDir(empty), /no files/);
});

test("the budget is inclusive at exactly 3.5 MB and fails one byte over", () => {
  assert.equal(checkBudget(BUDGET_BYTES).ok, true);
  assert.equal(checkBudget(BUDGET_BYTES + 1).ok, false);
});

test("the command exits 1 for a deliberately over-budget fixture", () => {
  const dir = fixture({ "big.js": BUDGET_BYTES + 1024 });
  const result = spawnSync(process.execPath, [script, dir], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /over the bundle size budget/);
});

test("the command exits 0 for a small fixture and 1 for a missing folder", () => {
  const ok = spawnSync(process.execPath, [script, fixture({ "small.js": 10 })], {
    encoding: "utf8",
  });
  assert.equal(ok.status, 0);
  const missing = spawnSync(process.execPath, [script, path.join(os.tmpdir(), "slayply-nope")], {
    encoding: "utf8",
  });
  assert.equal(missing.status, 1);
});
