import { describe, expect, it, vi } from "vitest";
import { ANTHROPIC_ORIGIN_PATTERN, createDirectModeController } from "./direct-mode.js";

function setup(granted: boolean | "throws") {
  const saved: boolean[] = [];
  const request = vi.fn(async (_origins: string[]) => {
    if (granted === "throws") throw new Error("no gesture");
    return granted;
  });
  const controller = createDirectModeController({
    save: async (on) => {
      saved.push(on);
    },
    requestOrigins: request,
  });
  return { controller, saved, request };
}

describe("direct mode controller", () => {
  it("asks only for the Anthropic origin, then turns on", async () => {
    const { controller, saved, request } = setup(true);
    expect(await controller.enable()).toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith([ANTHROPIC_ORIGIN_PATTERN]);
    expect(ANTHROPIC_ORIGIN_PATTERN).toBe("https://api.anthropic.com/*");
    expect(saved).toEqual([true]);
  });

  it("stays off when the browser permission is declined", async () => {
    const { controller, saved } = setup(false);
    const result = await controller.enable();
    expect(result.ok).toBe(false);
    expect(saved).toEqual([]);
  });

  it("stays off, with a message, when the permission request fails", async () => {
    const { controller, saved } = setup("throws");
    const result = await controller.enable();
    expect(result.ok).toBe(false);
    expect(saved).toEqual([]);
  });

  it("turns off without asking for anything", async () => {
    const { controller, saved, request } = setup(true);
    await controller.disable();
    expect(saved).toEqual([false]);
    expect(request).not.toHaveBeenCalled();
  });
});
