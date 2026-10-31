import { describe, expect, it } from "vitest";
import { answerPreview } from "./answer-preview.js";

describe("answerPreview", () => {
  it("returns short text unchanged", () => {
    expect(answerPreview("I build things.")).toBe("I build things.");
  });

  it("collapses whitespace and newlines to single spaces", () => {
    expect(answerPreview("One.\n\n  Two.\tThree.")).toBe("One. Two. Three.");
  });

  it("cuts long text at a word boundary and adds an ellipsis", () => {
    const text = "word ".repeat(40).trim();
    const preview = answerPreview(text, 20);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(21);
    expect(preview.slice(0, -1)).toMatch(/^(word ?)+$/);
  });

  it("cuts a single unbroken string at the limit", () => {
    expect(answerPreview("x".repeat(100), 10)).toBe(`${"x".repeat(10)}…`);
  });

  it("returns an empty string for blank text", () => {
    expect(answerPreview("  \n ")).toBe("");
  });
});
