import { describe, expect, it } from "vitest";
import { resolveClientIp } from "./client-ip.js";

describe("resolveClientIp", () => {
  it("uses the socket address when no proxy is trusted, ignoring forwarded headers", () => {
    expect(
      resolveClientIp({ forwardedFor: "6.6.6.6", socketAddress: "10.0.0.1", trustedHops: 0 }),
    ).toBe("10.0.0.1");
  });

  it("takes the entry the single trusted proxy appended, not the client-supplied one", () => {
    expect(
      resolveClientIp({
        forwardedFor: "6.6.6.6, 203.0.113.9",
        socketAddress: "10.0.0.1",
        trustedHops: 1,
      }),
    ).toBe("203.0.113.9");
  });

  it("counts hops from the right", () => {
    expect(
      resolveClientIp({
        forwardedFor: "6.6.6.6, 203.0.113.9, 10.1.1.1",
        socketAddress: "10.0.0.1",
        trustedHops: 2,
      }),
    ).toBe("203.0.113.9");
  });

  it("falls back to the socket address when the header is missing or too short", () => {
    expect(resolveClientIp({ socketAddress: "10.0.0.1", trustedHops: 1 })).toBe("10.0.0.1");
    expect(
      resolveClientIp({ forwardedFor: "203.0.113.9", socketAddress: "10.0.0.1", trustedHops: 2 }),
    ).toBe("10.0.0.1");
  });

  it("falls back when the selected entry is blank", () => {
    expect(
      resolveClientIp({ forwardedFor: "1.1.1.1, ", socketAddress: "10.0.0.1", trustedHops: 1 }),
    ).toBe("10.0.0.1");
  });

  it("never uses a selected entry that is not an IP address", () => {
    expect(
      resolveClientIp({
        forwardedFor: `${"a".repeat(500)}, 203.0.113.9`,
        socketAddress: "10.0.0.1",
        trustedHops: 2,
      }),
    ).toBe("10.0.0.1");
  });

  it("accepts IPv6 entries", () => {
    expect(
      resolveClientIp({ forwardedFor: "2001:db8::1", socketAddress: "10.0.0.1", trustedHops: 1 }),
    ).toBe("2001:db8::1");
  });

  it("returns a shared bucket key when nothing is known", () => {
    expect(resolveClientIp({ trustedHops: 0 })).toBe("unknown");
  });
});
