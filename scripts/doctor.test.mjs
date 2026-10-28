import assert from "node:assert/strict";
import test from "node:test";
import { checkEnvironment } from "./doctor.mjs";

test("doctor validates required development tools", () => {
  const { results, allPassed } = checkEnvironment();
  assert.equal(typeof allPassed, "boolean");
  assert.ok(results.length >= 4);

  const nodeResult = results.find((r) => r.tool === "Node.js");
  assert.ok(nodeResult);
  assert.equal(nodeResult.passed, true);

  const versionsDoc = results.find((r) => r.tool === "VERSIONS.md");
  assert.ok(versionsDoc);
  assert.equal(versionsDoc.passed, true);
});
