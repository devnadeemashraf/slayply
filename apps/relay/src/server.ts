import process from "node:process";
import { serve } from "@hono/node-server";
import { createClaudeAdapter } from "@slayply/providers";
import { createApp } from "./app.js";
import { parseConfig } from "./config.js";

const config = parseConfig(process.env);

// OpenAI and Gemini adapters arrive in PROV-02 and PROV-03; their routes answer 501 until then.
const app = createApp({
  providers: { anthropic: createClaudeAdapter() },
  extensionIds: config.extensionIds,
  trustedHops: config.trustedHops,
  log: (line) => console.log(line),
  now: () => Date.now(),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`relay listening on port ${info.port}`);
});
