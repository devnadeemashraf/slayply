import { describe, expect, it } from "vitest";
import { isReleaseBuild, resolveRelayUrl } from "./relay-url";

describe("resolveRelayUrl", () => {
  it("defaults to the local relay for a local build", () => {
    expect(resolveRelayUrl(undefined, false)).toBe("http://localhost:3000");
    expect(resolveRelayUrl("", false)).toBe("http://localhost:3000");
  });

  it("refuses a release build with no URL, so localhost is never shipped", () => {
    expect(() => resolveRelayUrl(undefined, true)).toThrow(/WXT_RELAY_URL/);
    expect(() => resolveRelayUrl("", true)).toThrow(/WXT_RELAY_URL/);
  });

  it("refuses localhost in a release build even when it is named", () => {
    expect(() => resolveRelayUrl("http://localhost:3000", true)).toThrow(/localhost/);
  });

  it("accepts https, and plain http only for localhost", () => {
    expect(resolveRelayUrl("https://relay.example.com", true)).toBe("https://relay.example.com");
    expect(resolveRelayUrl("http://localhost:4000", false)).toBe("http://localhost:4000");
    expect(() => resolveRelayUrl("http://relay.example.com", false)).toThrow(/https/);
    expect(() => resolveRelayUrl("not a url", false)).toThrow(/valid URL/);
  });
});

describe("isReleaseBuild", () => {
  it("is true for WXT_RELEASE=1 or the zip command", () => {
    expect(isReleaseBuild({ WXT_RELEASE: "1" }, ["wxt", "build"])).toBe(true);
    expect(isReleaseBuild({}, ["node", "wxt", "zip"])).toBe(true);
  });

  it("is false for an ordinary build or dev run", () => {
    expect(isReleaseBuild({}, ["node", "wxt", "build"])).toBe(false);
    expect(isReleaseBuild({ WXT_RELEASE: "0" }, ["node", "wxt"])).toBe(false);
  });
});
