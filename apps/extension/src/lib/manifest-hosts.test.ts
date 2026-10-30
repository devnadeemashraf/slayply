import { describe, expect, it } from "vitest";
import { JOB_SITE_ORIGINS } from "./job-sites.js";
import { OPTIONAL_HOST_PERMISSIONS } from "./manifest-hosts.js";

/** The browser only lets an extension request origins that its manifest declares as optional. */
function declared(pattern: string): boolean {
  return OPTIONAL_HOST_PERMISSIONS.some(
    (entry) => entry === pattern || (entry === "https://*/*" && pattern.startsWith("https://")),
  );
}

describe("manifest optional host permissions", () => {
  it("declare every origin the extension requests", () => {
    for (const pattern of [
      ...JOB_SITE_ORIGINS,
      "https://api.anthropic.com/*",
      "https://boards.example.com/*",
    ]) {
      expect(declared(pattern)).toBe(true);
    }
  });

  it("do not declare plain http or other schemes", () => {
    expect(OPTIONAL_HOST_PERMISSIONS.every((entry) => entry.startsWith("https://"))).toBe(true);
  });
});
