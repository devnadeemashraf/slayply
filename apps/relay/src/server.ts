import process from "node:process";
import { serve } from "@hono/node-server";
import { createClaudeAdapter, createGeminiAdapter, createOpenAiAdapter } from "@slayply/providers";
import { createApp } from "./app.js";
import { parseConfig } from "./config.js";

const config = parseConfig(process.env);

const app = createApp({
  providers: {
    anthropic: createClaudeAdapter(),
    openai: createOpenAiAdapter(),
    gemini: createGeminiAdapter(),
  },
  extensionIds: config.extensionIds,
  trustedHops: config.trustedHops,
  log: (line) => console.log(line),
  now: () => Date.now(),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`relay listening on port ${info.port}`);
});
