import { describe, expect, it } from "vitest";
import { charStatus, fitToLimit } from "./char-limit.js";

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

describe("fitToLimit", () => {
  it("returns the text unchanged when it already fits", () => {
    expect(fitToLimit("One. Two.", 20)).toEqual({ text: "One. Two.", dropped: 0 });
  });

  it("drops whole trailing sentences until it fits", () => {
    expect(fitToLimit("First one. Second one. Third one.", 25)).toEqual({
      text: "First one. Second one.",
      dropped: 1,
    });
  });

  it("counts the boundary exactly: equal to the limit fits, one over does not", () => {
    expect(fitToLimit("Abcd. Efgh.", 11)?.dropped).toBe(0);
    expect(fitToLimit("Abcd. Efgh.", 10)).toEqual({ text: "Abcd.", dropped: 1 });
  });

  it("keeps line breaks between paragraphs and trims trailing space", () => {
    expect(fitToLimit("Hi Sam,\n\nI build billing. I ship fast.", 25)).toEqual({
      text: "Hi Sam,\n\nI build billing.",
      dropped: 1,
    });
  });

  it("is null when even the first sentence is too long, or the limit is unusable", () => {
    expect(fitToLimit("A very long opening sentence. Short.", 10)).toBeNull();
    expect(fitToLimit("Text.", 0)).toBeNull();
    expect(fitToLimit("Text.", Number.NaN)).toBeNull();
    expect(fitToLimit("", 10)).toEqual({ text: "", dropped: 0 });
  });
});

describe("fitToLimit: sentence boundaries", () => {
  it("does not split inside a decimal or an abbreviation", () => {
    expect(fitToLimit("I have 3.5 years of React. Next one here.", 27)).toEqual({
      text: "I have 3.5 years of React.",
      dropped: 1,
    });
    expect(fitToLimit("I worked at Acme Inc. in the U.S. Then left.", 10)).toBeNull();
  });
});
