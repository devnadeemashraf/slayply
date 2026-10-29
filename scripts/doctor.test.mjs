import assert from "node:assert/strict";
import test from "node:test";
import { checkEnvironment } from "./doctor.mjs";

test("doctor validates required development tools", () => {
  const { results, allPassed } = checkEnvironment();
  assert.equal(typeof allPassed, "boolean");
  assert.ok(results.length >= 6);

  const nodeResult = results.find((r) => r.tool === "Node.js");
  assert.ok(nodeResult);
  assert.equal(nodeResult.passed, true);

  const versionsDoc = results.find((r) => r.tool === "VERSIONS.md");
  assert.ok(versionsDoc);
  assert.equal(versionsDoc.passed, true);

  const turboResult = results.find((r) => r.tool === "turbo");
  assert.ok(turboResult);
  assert.equal(turboResult.passed, true);

  const biomeResult = results.find((r) => r.tool === "Biome");
  assert.ok(biomeResult);
  assert.equal(biomeResult.passed, true);
});

test("doctor detects outdated Node.js version (sad path)", () => {
  const { results, allPassed } = checkEnvironment({
    nodeVersion: "v20.10.0",
  });
  assert.equal(allPassed, false);
  const nodeResult = results.find((r) => r.tool === "Node.js");
  assert.equal(nodeResult.passed, false);
});

test("doctor detects missing VERSIONS.md (sad path)", () => {
  const { results, allPassed } = checkEnvironment({
    versionsDocExists: false,
  });
  assert.equal(allPassed, false);
  const versionsDoc = results.find((r) => r.tool === "VERSIONS.md");
  assert.equal(versionsDoc.passed, false);
});

test("doctor detects failing tool command (edge case)", () => {
  const { results, allPassed } = checkEnvironment({
    execFn: (cmd) => {
      if (cmd.includes("pnpm --version")) throw new Error("pnpm not found");
      return "2.11.10";
    },
  });
  assert.equal(allPassed, false);
  const pnpmResult = results.find((r) => r.tool === "pnpm");
  assert.equal(pnpmResult.passed, false);
  assert.ok(pnpmResult.detected.includes("Error"));
});
