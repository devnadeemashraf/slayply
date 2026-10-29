import { describe, expect, it, vi } from "vitest";
import { ensureSiteAccess, type PermissionsApi } from "./capture-access.js";

function api(
  contains: boolean,
  grant: boolean,
): PermissionsApi & {
  request: ReturnType<typeof vi.fn>;
} {
  return {
    contains: vi.fn(async () => contains),
    request: vi.fn(async () => grant),
  };
}

describe("ensureSiteAccess", () => {
  it("does nothing when the site is already allowed", async () => {
    const perms = api(true, false);
    expect(await ensureSiteAccess("https://boards.greenhouse.io/acme/jobs/1", perms)).toBe(true);
    expect(perms.request).not.toHaveBeenCalled();
  });

  it("asks for just that site's origin, once, when it is not allowed", async () => {
    const perms = api(false, true);
    expect(await ensureSiteAccess("https://boards.greenhouse.io/acme/jobs/1", perms)).toBe(true);
    expect(perms.request).toHaveBeenCalledWith({ origins: ["https://boards.greenhouse.io/*"] });
  });

  it("reports a refusal", async () => {
    expect(await ensureSiteAccess("https://jobs.lever.co/x", api(false, false))).toBe(false);
  });

  it("never asks for LinkedIn, in any spelling", async () => {
    for (const url of [
      "https://www.linkedin.com/jobs/1",
      "https://www.linkedin.com./jobs/1",
      "https://lnkd.in/a",
    ]) {
      const perms = api(false, true);
      expect(await ensureSiteAccess(url, perms)).toBe(false);
      expect(perms.request).not.toHaveBeenCalled();
    }
  });

  it("never asks for browser pages, other schemes or unparseable URLs", async () => {
    for (const url of ["chrome://extensions", "file:///a.html", "not a url", ""]) {
      const perms = api(false, true);
      expect(await ensureSiteAccess(url, perms)).toBe(false);
      expect(perms.request).not.toHaveBeenCalled();
    }
  });

  it("treats a failing permissions call as no access", async () => {
    const perms: PermissionsApi = {
      contains: async () => {
        throw new Error("boom");
      },
      request: async () => true,
    };
    expect(await ensureSiteAccess("https://example.com/", perms)).toBe(false);
  });
});
