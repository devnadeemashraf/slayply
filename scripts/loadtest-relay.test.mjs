import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { P99_BUDGET_MS, RELAY_APP, runLoad } from "./loadtest-relay.mjs";

// The relay must be built first; a fresh clone runs this suite before any build.
const built = fs.existsSync(fileURLToPath(RELAY_APP));

test("a short run completes every request inside the latency budget", {
  skip: !built,
}, async () => {
  const result = await runLoad({ requests: 300, concurrency: 20 });
  assert.equal(result.ok, 300);
  assert.ok(result.p99 < P99_BUDGET_MS, `p99 ${result.p99} ms`);
  assert.ok(result.p50 <= result.p95 && result.p95 <= result.p99 && result.p99 <= result.max);
});
