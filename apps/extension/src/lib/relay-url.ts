/** Where the relay lives in this build; a release build must name an https one (REL-01). */
export function resolveRelayUrl(value: string | undefined, release: boolean): string {
  if (value === undefined || value === "") {
    // Local builds default to the dev relay. A store build must never ship it: user API keys
    // would be sent to whatever listens on localhost.
    if (release) throw new Error("WXT_RELAY_URL must be set for a release build");
    return "http://localhost:3000";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("WXT_RELAY_URL is not a valid URL");
  }
  const local = url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !local) {
    throw new Error("WXT_RELAY_URL must use https (http is allowed only for localhost)");
  }
  if (release && local) throw new Error("WXT_RELAY_URL must not be localhost in a release build");
  return value;
}

/** `wxt zip` is how a store package is made, so it counts as a release even without WXT_RELEASE. */
export function isReleaseBuild(env: Record<string, string | undefined>, argv: string[]): boolean {
  return env.WXT_RELEASE === "1" || argv.includes("zip");
}
