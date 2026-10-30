export type RelayConfig = {
  port: number;
  extensionIds: string[];
  trustedHops: number;
};

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

function integerFrom(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`${name} must be a non-negative integer`);
  return Number(raw.trim());
}

/** Reads and validates environment variables; throws with a message naming the variable. */
export function parseConfig(env: Record<string, string | undefined>): RelayConfig {
  const port = integerFrom("PORT", env.PORT, 3000);
  if (port < 1 || port > 65_535) throw new Error("PORT must be between 1 and 65535");

  const trustedHops = integerFrom("TRUST_PROXY_HOPS", env.TRUST_PROXY_HOPS, 0);

  const extensionIds = (env.EXTENSION_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  for (const id of extensionIds) {
    if (!EXTENSION_ID_PATTERN.test(id)) {
      throw new Error("EXTENSION_IDS must be comma-separated 32-character IDs using a-p");
    }
  }

  if (env.NODE_ENV === "production" && extensionIds.length === 0) {
    throw new Error("EXTENSION_IDS is required when NODE_ENV=production");
  }
  // Unset means 0, which puts every client behind the proxy in one rate-limit bucket.
  if (env.NODE_ENV === "production" && (env.TRUST_PROXY_HOPS ?? "").trim() === "") {
    throw new Error("TRUST_PROXY_HOPS is required when NODE_ENV=production");
  }

  return { port, extensionIds, trustedHops };
}
