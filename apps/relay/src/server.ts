import process from "node:process";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { parseConfig } from "./config.js";

const config = parseConfig(process.env);

// No provider adapters exist until PROV-01, so /v1/generate answers 501 for now.
const app = createApp({
  providers: {},
  extensionIds: config.extensionIds,
  trustedHops: config.trustedHops,
  log: (line) => console.log(line),
  now: () => Date.now(),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`relay listening on port ${info.port}`);
});
