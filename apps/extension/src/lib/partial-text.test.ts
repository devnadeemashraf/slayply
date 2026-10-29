import { describe, expect, it } from "vitest";
import { extractAnswerPreview } from "./partial-text.js";

const ANSWER = 'He said "hi"\nthen left \\ path é ☕ \u{1F600} tab\there';
const FULL = JSON.stringify({
  outputs: [{ id: "q1", label: "Answer", text: ANSWER, claims: [], charCount: 1 }],
  warnings: [],
});

describe("extractAnswerPreview", () => {
  it("returns an empty string before the text field has started", () => {
    expect(extractAnswerPreview("")).toBe("");
    expect(extractAnswerPreview('{"outputs":[{"id":"q1","label":"A"')).toBe("");
    expect(extractAnswerPreview('{"outputs":[{"id":"q1","text"')).toBe("");
  });

  it("returns the decoded text of a complete reply", () => {
    expect(extractAnswerPreview(FULL)).toBe(ANSWER);
  });

  it("only ever grows as the buffer grows, and matches at the end (cut at every index)", () => {
    let previous = "";
    for (let end = 0; end <= FULL.length; end += 1) {
      const preview = extractAnswerPreview(FULL.slice(0, end));
      expect(ANSWER.startsWith(preview)).toBe(true);
      expect(preview.startsWith(previous)).toBe(true);
      previous = preview;
    }
    expect(previous).toBe(ANSWER);
  });

  it("does not show half of an escape sequence or a lone surrogate", () => {
    const buffer = '{"outputs":[{"text":"a\\u00';
    expect(extractAnswerPreview(buffer)).toBe("a");
    expect(extractAnswerPreview('{"outputs":[{"text":"a\\')).toBe("a");
    expect(extractAnswerPreview('{"outputs":[{"text":"a\\ud83d')).toBe("a");
    expect(extractAnswerPreview('{"outputs":[{"text":"a\\ud83d\\ude00')).toBe("a\u{1F600}");
  });

  it("stops at the closing quote and ignores later fields, even ones named text", () => {
    const buffer = '{"outputs":[{"text":"first","claims":[{"text":"second"}]}]}';
    expect(extractAnswerPreview(buffer)).toBe("first");
  });

  it("is not fooled by an escaped key inside a string value", () => {
    const buffer = '{"warnings":["he wrote \\"text\\": \\"fake\\""],"outputs":[{"text":"real"}]}';
    expect(extractAnswerPreview(buffer)).toBe("real");
  });

  it("tolerates whitespace around the colon", () => {
    expect(extractAnswerPreview('{"outputs":[{"text"  :\n  "spaced"}]}')).toBe("spaced");
  });

  it("returns what it has for an unknown escape rather than throwing", () => {
    expect(extractAnswerPreview('{"outputs":[{"text":"a\\qb"}]}')).toBe("ab");
  });

  it("returns an empty string for text that is not JSON at all", () => {
    expect(extractAnswerPreview("Sure! Here is your answer.")).toBe("");
  });
});
