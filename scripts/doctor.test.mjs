import assert from "node:assert/strict";
import test from "node:test";
import { checkEnvironment, compareVersions, parseVersion } from "./doctor.mjs";

const pins = {
  node: "24.21.0",
  pnpm: "12.6.0",
  turbo: "2.11.10",
  biome: "2.6.3",
  typescript: "7.0.2",
};

const healthyExec = (cmd) => {
  if (cmd.startsWith("pnpm --version")) return "12.6.0\n";
  if (cmd.startsWith("git --version")) return "git version 2.53.0.windows.2\n";
  if (cmd.includes("turbo")) return "2.11.10\n";
  if (cmd.includes("biome")) return "Version: 2.6.3\n";
  if (cmd.includes("tsc")) return "Version 7.0.2\n";
  throw new Error(`unexpected command: ${cmd}`);
};

const baseOptions = {
  pins,
  nodeVersion: "v24.21.0",
  execFn: healthyExec,
  versionsDocExists: true,
};

const find = (results, tool) => results.find((r) => r.tool === tool);

test("parseVersion extracts semver from tool output and rejects garbage", () => {
  assert.deepEqual(parseVersion("v24.21.0"), [24, 21, 0]);
  assert.deepEqual(parseVersion("git version 2.53.0.windows.2"), [2, 53, 0]);
  assert.deepEqual(parseVersion("Version: 2.6.3"), [2, 6, 3]);
  assert.equal(parseVersion("not a version"), null);
  assert.equal(parseVersion(undefined), null);
});

test("compareVersions orders versions and returns null when unparseable", () => {
  assert.equal(compareVersions("24.21.0", "24.21.0"), 0);
  assert.ok(compareVersions("24.20.9", "24.21.0") < 0);
  assert.ok(compareVersions("25.0.0", "24.21.0") > 0);
  assert.ok(compareVersions("v24.21.1", "24.21.0") > 0);
  assert.equal(compareVersions("junk", "24.21.0"), null);
});

test("passes when every tool matches its pin", () => {
  const { results, allPassed } = checkEnvironment(baseOptions);
  assert.equal(allPassed, true);
  assert.equal(results.length, 7);
});

test("rejects a Node.js version below the pinned patch (not just the major)", () => {
  const { results, allPassed } = checkEnvironment({ ...baseOptions, nodeVersion: "v24.20.0" });
  assert.equal(allPassed, false);
  assert.equal(find(results, "Node.js").passed, false);
});

test("rejects an outdated Node.js major", () => {
  const { allPassed } = checkEnvironment({ ...baseOptions, nodeVersion: "v20.10.0" });
  assert.equal(allPassed, false);
});

test("rejects exact-pinned tools that drift in either direction", () => {
  for (const [needle, output, tool] of [
    ["biome", "Version: 2.7.0\n", "Biome"],
    ["turbo", "2.11.9\n", "turbo"],
    ["tsc", "Version 7.0.3\n", "TypeScript"],
  ]) {
    const { results, allPassed } = checkEnvironment({
      ...baseOptions,
      execFn: (cmd) => (cmd.includes(needle) ? output : healthyExec(cmd)),
    });
    assert.equal(allPassed, false, `${tool} drift should fail`);
    assert.equal(find(results, tool).passed, false);
  }
});

test("rejects git older than 2.50", () => {
  const { results } = checkEnvironment({
    ...baseOptions,
    execFn: (cmd) => (cmd.startsWith("git") ? "git version 2.39.1\n" : healthyExec(cmd)),
  });
  assert.equal(find(results, "Git").passed, false);
});

test("reports a missing tool as a failure with the error message", () => {
  const { results, allPassed } = checkEnvironment({
    ...baseOptions,
    execFn: (cmd) => {
      if (cmd.startsWith("pnpm --version")) throw new Error("pnpm not found");
      return healthyExec(cmd);
    },
  });
  assert.equal(allPassed, false);
  assert.match(find(results, "pnpm").detected, /Error: pnpm not found/);
});

test("fails when docs/VERSIONS.md is missing", () => {
  const { results, allPassed } = checkEnvironment({ ...baseOptions, versionsDocExists: false });
  assert.equal(allPassed, false);
  assert.equal(find(results, "VERSIONS.md").passed, false);
});

test("fails closed when a pin is missing from package.json", () => {
  const { allPassed } = checkEnvironment({ ...baseOptions, pins: { ...pins, node: undefined } });
  assert.equal(allPassed, false);
});
