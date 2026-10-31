import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXTENSION_ID, EXTENSION_KEY } from "./extension-id";

// Chrome's rule: the ID is the first 32 hex digits of the SHA-256 of the DER public key, with the
// digits 0-9a-f written as the letters a-p.
function idFromKey(base64: string): string {
  const hex = createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex").slice(0, 32);
  return [...hex].map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join("");
}

describe("pinned extension ID", () => {
  it("is the ID Chrome derives from the manifest key", () => {
    expect(idFromKey(EXTENSION_KEY)).toBe(EXTENSION_ID);
  });

  it("has the shape the relay accepts in EXTENSION_IDS", () => {
    expect(EXTENSION_ID).toMatch(/^[a-p]{32}$/);
  });

  it("holds a public key and no private key material", () => {
    expect(EXTENSION_KEY).not.toMatch(/PRIVATE/);
    expect(Buffer.from(EXTENSION_KEY, "base64").length).toBeGreaterThan(200);
  });
});
