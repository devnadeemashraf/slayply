import { describe, expect, it } from "vitest";
import { styleSummary } from "./style-summary.js";

describe("styleSummary", () => {
  it("names what will be written, in which tone and length", () => {
    expect(styleSummary("answers", "crisp", "medium")).toBe(
      "Answers to questions · Crisp · Medium",
    );
    expect(styleSummary("cover_letter", "warm", "long")).toBe("Cover letter · Warm · Long");
  });
});
