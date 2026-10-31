import { describe, expect, it } from "vitest";
import { setupChecklist, TABS } from "./panel-nav.js";

describe("TABS", () => {
  it("lists the four tabs in order", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["apply", "saved", "you", "setup"]);
  });

  it("labels them Apply, Saved, You and Setup, so no two names look alike", () => {
    expect(TABS.map((tab) => tab.label)).toEqual(["Apply", "Saved", "You", "Setup"]);
  });
});

describe("setupChecklist", () => {
  it("marks what is done and points each open item at the tab that fixes it", () => {
    const items = setupChecklist({ hasKey: true, hasProfile: false, hasResume: false });
    expect(items.map((item) => [item.id, item.done, item.tab])).toEqual([
      ["key", true, "setup"],
      ["profile", false, "you"],
      ["resume", false, "you"],
    ]);
  });

  it("is all done when everything exists", () => {
    const items = setupChecklist({ hasKey: true, hasProfile: true, hasResume: true });
    expect(items.every((item) => item.done)).toBe(true);
  });

  it("flags only the key as required", () => {
    const items = setupChecklist({ hasKey: false, hasProfile: false, hasResume: false });
    expect(items.filter((item) => item.required).map((item) => item.id)).toEqual(["key"]);
  });
});
