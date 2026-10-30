import { describe, expect, it } from "vitest";
import { parseConfig } from "./config.js";

const EXT = "abcdefghijklmnopabcdefghijklmnop";

describe("parseConfig", () => {
  it("applies defaults", () => {
    expect(parseConfig({})).toEqual({
      port: 3000,
      extensionIds: [],
      trustedHops: 0,
    });
  });

  it("reads port, hops and a trimmed list of extension IDs", () => {
    const config = parseConfig({
      PORT: "8080",
      TRUST_PROXY_HOPS: "1",
      EXTENSION_IDS: ` ${EXT} , ${EXT.split("").reverse().join("")} `,
      NODE_ENV: "production",
    });
    expect(config.port).toBe(8080);
    expect(config.trustedHops).toBe(1);
    expect(config.extensionIds).toHaveLength(2);
  });

  it("requires an explicit hop count in production", () => {
    const base = { NODE_ENV: "production", EXTENSION_IDS: EXT };
    expect(() => parseConfig(base)).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => parseConfig({ ...base, TRUST_PROXY_HOPS: " " })).toThrow(/TRUST_PROXY_HOPS/);
    expect(parseConfig({ ...base, TRUST_PROXY_HOPS: "0" }).trustedHops).toBe(0);
  });

  it("requires an extension ID in production", () => {
    expect(() => parseConfig({ NODE_ENV: "production" })).toThrow(/EXTENSION_IDS/);
  });

  it("rejects malformed extension IDs", () => {
    expect(() => parseConfig({ EXTENSION_IDS: "short" })).toThrow(/EXTENSION_IDS/);
    expect(() => parseConfig({ EXTENSION_IDS: "*" })).toThrow(/EXTENSION_IDS/);
    expect(() => parseConfig({ EXTENSION_IDS: "A".repeat(32) })).toThrow(/EXTENSION_IDS/);
  });

  it("rejects invalid ports and hop counts", () => {
    expect(() => parseConfig({ PORT: "abc" })).toThrow(/PORT/);
    expect(() => parseConfig({ PORT: "0" })).toThrow(/PORT/);
    expect(() => parseConfig({ PORT: "70000" })).toThrow(/PORT/);
    expect(() => parseConfig({ TRUST_PROXY_HOPS: "-1" })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => parseConfig({ TRUST_PROXY_HOPS: "1.5" })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it("treats empty values as unset", () => {
    expect(parseConfig({ PORT: "", EXTENSION_IDS: "", TRUST_PROXY_HOPS: "" }).port).toBe(3000);
  });
});
