const EXTENSION_SCHEME = "chrome-extension:";

/**
 * Exact-match origin check. The origin is parsed rather than pattern-matched so that
 * `http://localhost.evil.com` and `http://localhost@evil.com` cannot pass as localhost.
 */
export function isAllowedOrigin(origin: string, extensionIds: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // A real Origin header is exactly scheme://host[:port]: no userinfo, path, query or suffix.
  if (origin !== `${url.protocol}//${url.host}`) return false;

  if (url.protocol === "http:") return url.hostname === "localhost";
  if (url.protocol === EXTENSION_SCHEME) return extensionIds.includes(url.host);
  return false;
}
