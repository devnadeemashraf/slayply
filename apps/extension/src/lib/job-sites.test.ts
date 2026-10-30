import { describe, expect, it, vi } from "vitest";
import { isLinkedInUrl } from "./capture.js";
import { createSiteAccessController, JOB_SITE_ORIGINS } from "./job-sites.js";

describe("JOB_SITE_ORIGINS", () => {
  it("are https match patterns for a host, with an optional leading wildcard label", () => {
    for (const pattern of JOB_SITE_ORIGINS) {
      expect(pattern).toMatch(/^https:\/\/(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\/\*$/);
    }
  });

  it("never include LinkedIn or its short-link host, and no catch-all", () => {
    for (const pattern of JOB_SITE_ORIGINS) {
      const sample = pattern.replace("*.", "www.").replace("/*", "/");
      expect(isLinkedInUrl(sample)).toBe(false);
      expect(pattern).not.toBe("https://*/*");
    }
  });

  it("cover the popular boards, including Workday (Oracle tenants ask once instead)", () => {
    const all = JOB_SITE_ORIGINS.join(" ");
    for (const host of [
      "greenhouse.io",
      "lever.co",
      "ashbyhq.com",
      "myworkdayjobs.com",
      "icims.com",
      "smartrecruiters.com",
      "taleo.net",
    ]) {
      expect(all).toContain(host);
    }
  });

  it("leave out HR, payroll, learning and cloud-platform hosts that are not just job sites", () => {
    const all = JOB_SITE_ORIGINS.join(" ");
    for (const host of [
      "oraclecloud.com",
      "workday.com",
      "bamboohr.com",
      "successfactors",
      "csod.com",
      "paycomonline",
      "://*.rippling.com",
    ]) {
      expect(all).not.toContain(host);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(JOB_SITE_ORIGINS).size).toBe(JOB_SITE_ORIGINS.length);
  });
});

describe("createSiteAccessController", () => {
  const make = (contains: boolean, grant: boolean) => {
    const permissions = {
      contains: vi.fn(async () => contains),
      getAll: vi.fn(async () => ({ origins: contains ? [...JOB_SITE_ORIGINS] : [] })),
      request: vi.fn(async () => grant),
      remove: vi.fn(async () => true),
    };
    return { permissions, controller: createSiteAccessController(permissions) };
  };

  it("counts as on when any listed origin is still granted", async () => {
    const permissions = {
      contains: vi.fn(async () => false),
      getAll: vi.fn(async () => ({
        origins: [JOB_SITE_ORIGINS[0] ?? "", "https://other.example/*"],
      })),
      request: vi.fn(async () => true),
      remove: vi.fn(async () => true),
    };
    expect(await createSiteAccessController(permissions).isEnabled()).toBe(true);
  });

  it("reports whether the list is granted", async () => {
    expect(await make(true, false).controller.isEnabled()).toBe(true);
    expect(await make(false, false).controller.isEnabled()).toBe(false);
  });

  it("asks for the whole list in one request", async () => {
    const { permissions, controller } = make(false, true);
    expect(await controller.enable()).toEqual({ ok: true });
    expect(permissions.request).toHaveBeenCalledWith({ origins: [...JOB_SITE_ORIGINS] });
  });

  it("reports a refusal", async () => {
    const result = await make(false, false).controller.enable();
    expect(result.ok).toBe(false);
  });

  it("turns off by removing the list, and nothing else", async () => {
    const { permissions, controller } = make(true, true);
    await controller.disable();
    expect(permissions.remove).toHaveBeenCalledWith({ origins: [...JOB_SITE_ORIGINS] });
  });

  it("treats a failing permissions call as off and as a refusal, never a crash", async () => {
    const boom = async () => {
      throw new Error("boom");
    };
    const controller = createSiteAccessController({
      contains: boom,
      getAll: boom,
      request: boom,
      remove: boom,
    });
    expect(await controller.isEnabled()).toBe(false);
    expect((await controller.enable()).ok).toBe(false);
    expect((await controller.disable()).ok).toBe(false);
  });
});
