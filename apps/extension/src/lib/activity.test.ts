import { describe, expect, it } from "vitest";
import { formatElapsed, isSlow, SLOW_AFTER_MS, stageLabel } from "./activity.js";

describe("formatElapsed", () => {
  it("shows minutes and zero-padded seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7_400)).toBe("0:07");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(600_000)).toBe("10:00");
  });

  it("never shows a negative or non-finite time", () => {
    expect(formatElapsed(-5_000)).toBe("0:00");
    expect(formatElapsed(Number.NaN)).toBe("0:00");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("isSlow", () => {
  it("turns on at 30 seconds, not before", () => {
    expect(SLOW_AFTER_MS).toBe(30_000);
    expect(isSlow(SLOW_AFTER_MS - 1)).toBe(false);
    expect(isSlow(SLOW_AFTER_MS)).toBe(true);
  });
});

describe("stageLabel", () => {
  it("names every stage differently", () => {
    const labels = (["connecting", "waiting", "writing", "checking"] as const).map((stage) =>
      stageLabel(stage, 1),
    );
    expect(new Set(labels).size).toBe(4);
  });

  it("says it is the second attempt, and only then", () => {
    expect(stageLabel("waiting", 1)).not.toMatch(/second|2 of 2/i);
    expect(stageLabel("waiting", 2)).toMatch(/attempt 2 of 2/i);
  });
});
