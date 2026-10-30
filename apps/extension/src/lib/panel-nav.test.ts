import { describe, expect, it } from "vitest";
import { nextTab, setupChecklist, TABS } from "./panel-nav.js";

describe("nextTab", () => {
  it("moves right and left, wrapping at both ends", () => {
    expect(nextTab("job", "ArrowRight")).toBe("jobs");
    expect(nextTab("setup", "ArrowRight")).toBe("job");
    expect(nextTab("jobs", "ArrowLeft")).toBe("job");
    expect(nextTab("job", "ArrowLeft")).toBe("setup");
  });

  it("jumps to the first and last tab", () => {
    expect(nextTab("you", "Home")).toBe("job");
    expect(nextTab("you", "End")).toBe("setup");
  });

  it("ignores every other key", () => {
    expect(nextTab("job", "Enter")).toBeNull();
    expect(nextTab("job", "a")).toBeNull();
    expect(nextTab("job", "ArrowDown")).toBeNull();
  });

  it("lists the four tabs in order", () => {
    expect(TABS.map((tab) => tab.id)).toEqual(["job", "jobs", "you", "setup"]);
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
