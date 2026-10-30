import { describe, expect, it } from "vitest";
import { charStatus } from "./char-limit.js";

describe("charStatus", () => {
  it("is null when there is no usable limit", () => {
    expect(charStatus(50, undefined)).toBeNull();
    expect(charStatus(50, 0)).toBeNull();
    expect(charStatus(50, -5)).toBeNull();
    expect(charStatus(50, Number.NaN)).toBeNull();
  });

  it("is ok well under the limit and labels the count in text", () => {
    expect(charStatus(120, 300)).toEqual({ ratio: 0.4, tone: "ok", label: "120 / 300" });
  });

  it("warns from 90% up to the limit", () => {
    expect(charStatus(269, 300)?.tone).toBe("ok");
    expect(charStatus(270, 300)?.tone).toBe("warn");
    expect(charStatus(300, 300)?.tone).toBe("warn");
  });

  it("goes bad over the limit, with the ring capped at full", () => {
    const over = charStatus(301, 300);
    expect(over?.tone).toBe("bad");
    expect(over?.ratio).toBe(1);
    expect(over?.label).toBe("301 / 300");
  });

  it("handles an empty answer", () => {
    expect(charStatus(0, 300)).toEqual({ ratio: 0, tone: "ok", label: "0 / 300" });
  });

  it("formats large counts with separators", () => {
    expect(charStatus(1500, 2000)?.label).toBe("1,500 / 2,000");
  });
});
