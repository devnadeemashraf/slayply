import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { OPTIONAL_HOST_PERMISSIONS } from "./manifest-hosts";

// REL-01: the permission set is part of the store listing (docs/STORE_LISTING.md). Changing it
// must be a deliberate edit to both, so these tests pin it.
const config = fs.readFileSync(new URL("../../wxt.config.ts", import.meta.url), "utf8");

describe("manifest permissions", () => {
  it("requests exactly the documented permissions", () => {
    const listed = /permissions: \[([^\]]*)\]/.exec(config)?.[1] ?? "";
    const names = [...listed.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(names).toEqual(["sidePanel", "storage", "contextMenus", "activeTab", "scripting"]);
  });

  it("grants host access only to the relay at install", () => {
    expect(config).toMatch(/host_permissions: \[`\$\{new URL\(relayUrl\)\.origin\}\/\*`\]/);
    expect(config).not.toContain("<all_urls>");
  });

  it("can only ask at run time for the provider host or an https site", () => {
    expect(OPTIONAL_HOST_PERMISSIONS).toEqual(["https://api.anthropic.com/*", "https://*/*"]);
  });

  it("blocks remote code in extension pages", () => {
    expect(config).toContain("script-src 'self'; object-src 'self'");
  });

  it("ships icons for the manifest and the store", () => {
    for (const size of [16, 32, 48, 96, 128]) {
      const url = new URL(`../../public/icon/${size}.png`, import.meta.url);
      expect(fs.existsSync(url)).toBe(true);
    }
  });
});
