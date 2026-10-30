#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Streams requests through the built relay app in-process against a stub provider, so it measures
// the relay's own overhead (validation, limiter, SSE framing), not a vendor's latency or the network.
// Needs `pnpm --filter "@slayply/relay..." run build` first.
export const P99_BUDGET_MS = 1500; // SPEC section 5: first token under 1.5 s
export const RELAY_APP = new URL("../apps/relay/dist/app.js", import.meta.url);

const REQUEST = JSON.stringify({
  task: "cover_letter",
  job: { jd: "Build things", company: "Acme" },
  resume: { track: "backend", region: "us", text: "Ten years of Go." },
  profile: { facts: [{ id: "F01", text: "Led a team of 5" }], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
});

function stubProvider() {
  const stream = () =>
    (async function* () {
      yield { type: "delta", text: "Hello" };
      yield { type: "delta", text: " world" };
      yield { type: "done" };
    })();
  return { id: "anthropic", stream, streamCompletion: stream, listModels: async () => [] };
}

/** Returns requests, ok, rps and first-chunk latency percentiles in milliseconds. */
export async function runLoad({ requests = 5000, concurrency = 100 } = {}) {
  const { createApp } = await import(RELAY_APP.href);
  const app = createApp({
    providers: { anthropic: stubProvider() },
    extensionIds: [],
    trustedHops: 1,
    log: () => {},
    now: Date.now,
    // Lifted so the limiter does not reject the test; each request also gets its own address.
    rateLimit: { limit: 1_000_000, windowMs: 60_000 },
    maxOpenStreamsPerIp: 1_000_000,
  });

  const latencies = [];
  let ok = 0;
  let next = 0;
  const started = performance.now();
  const worker = async () => {
    while (next < requests) {
      const n = next++;
      const sent = performance.now();
      const response = await app.request("/v1/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-anthropic-key": "sk-ant-test-key-123",
          "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`,
        },
        body: REQUEST,
      });
      const reader = response.body.getReader();
      await reader.read();
      latencies.push(performance.now() - sent);
      while (!(await reader.read()).done);
      if (response.status === 200) ok++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const seconds = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const at = (p) => latencies[Math.floor(p * (latencies.length - 1))];
  return {
    requests,
    concurrency,
    ok,
    rps: requests / seconds,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: latencies.at(-1),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(fileURLToPath(RELAY_APP))) {
    console.error('Relay is not built. Run: pnpm --filter "@slayply/relay..." run build');
    process.exit(1);
  }
  const requests = Number(process.argv[2] ?? 5000);
  const concurrency = Number(process.argv[3] ?? 100);
  const r = await runLoad({ requests, concurrency });
  console.log(
    `requests=${r.requests} concurrency=${r.concurrency} ok=${r.ok} rps=${r.rps.toFixed(0)} ` +
      `p50=${r.p50.toFixed(1)}ms p95=${r.p95.toFixed(1)}ms p99=${r.p99.toFixed(1)}ms max=${r.max.toFixed(1)}ms`,
  );
  if (r.ok !== r.requests || r.p99 > P99_BUDGET_MS) {
    console.error(`Load test failed: ${r.requests - r.ok} errors, p99 budget ${P99_BUDGET_MS} ms.`);
    process.exit(1);
  }
}
