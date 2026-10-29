import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./cors.js";

const EXT = "abcdefghijklmnopabcdefghijklmnop";
const OTHER = "ponmlkjihgfedcbaponmlkjihgfedcba";

describe("isAllowedOrigin", () => {
  it("allows the configured extension origin exactly", () => {
    expect(isAllowedOrigin(`chrome-extension://${EXT}`, [EXT])).toBe(true);
  });

  it("allows any of several configured extension IDs", () => {
    expect(isAllowedOrigin(`chrome-extension://${OTHER}`, [EXT, OTHER])).toBe(true);
  });

  it("allows localhost on any port", () => {
    expect(isAllowedOrigin("http://localhost:5173", [])).toBe(true);
    expect(isAllowedOrigin("http://localhost", [])).toBe(true);
  });

  it("denies an unconfigured extension", () => {
    expect(isAllowedOrigin(`chrome-extension://${OTHER}`, [EXT])).toBe(false);
  });

  it("denies lookalike hosts", () => {
    expect(isAllowedOrigin("http://localhost.evil.com", [])).toBe(false);
    expect(isAllowedOrigin("http://localhost@evil.com", [])).toBe(false);
    expect(isAllowedOrigin("http://evil.com/localhost", [])).toBe(false);
    expect(isAllowedOrigin("http://notlocalhost:3000", [])).toBe(false);
  });

  it("denies https localhost and other schemes", () => {
    expect(isAllowedOrigin("https://localhost:3000", [])).toBe(false);
    expect(isAllowedOrigin("ftp://localhost", [])).toBe(false);
  });

  it("denies extension origins with a suffix or path", () => {
    expect(isAllowedOrigin(`chrome-extension://${EXT}.evil.com`, [EXT])).toBe(false);
    expect(isAllowedOrigin(`chrome-extension://${EXT}/page`, [EXT])).toBe(false);
  });

  it("denies the wildcard, null, empty and malformed origins", () => {
    expect(isAllowedOrigin("*", [EXT])).toBe(false);
    expect(isAllowedOrigin("null", [EXT])).toBe(false);
    expect(isAllowedOrigin("", [EXT])).toBe(false);
    expect(isAllowedOrigin("not a url", [EXT])).toBe(false);
  });
});
