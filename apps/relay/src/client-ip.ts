import { isIP } from "node:net";

export type ClientIpInput = {
  forwardedFor?: string | undefined;
  socketAddress?: string | undefined;
  /** Reverse proxies we control between the internet and this process. */
  trustedHops: number;
};

/**
 * Picks the address to rate-limit on. Each trusted proxy appends the address it saw, so the
 * entry `trustedHops` from the right is the first one a client cannot forge; the leftmost
 * entries are client-supplied and are never used.
 */
export function resolveClientIp({
  forwardedFor,
  socketAddress,
  trustedHops,
}: ClientIpInput): string {
  if (trustedHops > 0 && forwardedFor !== undefined) {
    const entries = forwardedFor.split(",").map((entry) => entry.trim());
    const candidate = entries[entries.length - trustedHops];
    // Anything that is not an IP (e.g. a client-chosen string when the hop count is set too
    // high) must not become a rate-limit key.
    if (candidate !== undefined && isIP(candidate) !== 0) return candidate;
  }
  return socketAddress || "unknown";
}
