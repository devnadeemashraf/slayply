import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const blueprint = fs.readFileSync(`${root}render.yaml`, "utf8");

test("the relay is a free node web service with a health check", () => {
  assert.match(blueprint, /name: slayply-relay/);
  assert.match(blueprint, /plan: free/);
  assert.match(blueprint, /healthCheckPath: \/health/);
});

test("the relay builds its workspace dependencies and pins Node 24", () => {
  assert.match(blueprint, /pnpm --filter "@slayply\/relay\.\.\." run build/);
  assert.match(blueprint, /key: NODE_VERSION\n\s+value: 24/);
});

test("the start command runs the file the relay build produces", () => {
  const start = /startCommand: node (\S+)/.exec(blueprint)?.[1];
  assert.equal(start, "apps/relay/dist/server.js");
  const tsconfig = JSON.parse(fs.readFileSync(`${root}apps/relay/tsconfig.build.json`, "utf8"));
  assert.equal(tsconfig.compilerOptions.outDir, "dist");
});

test("production secrets are never written into the blueprint", () => {
  for (const key of ["EXTENSION_IDS", "TRUST_PROXY_HOPS"]) {
    assert.match(blueprint, new RegExp(`key: ${key}\\n\\s+sync: false`), key);
  }
  assert.match(blueprint, /key: NODE_ENV\n\s+value: production/);
  assert.doesNotMatch(blueprint, /sk-|AIza/);
});

test("the static site publishes the folder its build writes", () => {
  assert.match(blueprint, /runtime: static/);
  assert.match(blueprint, /staticPublishPath: apps\/site\/dist/);
  assert.match(blueprint, /buildCommand: node apps\/site\/build\.mjs/);
});
