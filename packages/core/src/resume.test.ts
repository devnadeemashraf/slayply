import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.js";
import {
  assembleResume,
  itemsToText,
  type PdfTextItem,
  resumeTagSchema,
  storedResumeSchema,
} from "./resume.js";

const PAGE = 600;

function item(str: string, x: number, y: number, width = str.length * 5): PdfTextItem {
  return { str, x, y, width, height: 10 };
}

/** Lines of `count` words down a column that starts at `x`, top (y = 700) to bottom. */
function column(prefix: string, x: number, count: number, width = 200): PdfTextItem[] {
  return Array.from({ length: count }, (_, i) => item(`${prefix}${i + 1}`, x, 700 - i * 14, width));
}

describe("itemsToText", () => {
  it("returns an empty string for no items", () => {
    expect(itemsToText([], PAGE)).toBe("");
  });

  it("reads lines top to bottom even when items arrive shuffled", () => {
    const items = [
      item("third", 50, 660, 300),
      item("first", 50, 700, 300),
      item("second", 50, 680, 300),
    ];
    expect(itemsToText(items, PAGE)).toBe("first\nsecond\nthird");
  });

  it("joins items on one line left to right, with a space only where there is a gap", () => {
    const items = [item("World", 100, 700), item("Hello", 50, 700, 45), item("!", 125, 700, 5)];
    expect(itemsToText(items, PAGE)).toBe("Hello World!");
  });

  it("treats a small baseline wobble as the same line", () => {
    const items = [item("Left", 50, 700.4, 100), item("Right", 200, 699.8, 100)];
    expect(itemsToText(items, PAGE)).toBe("Left Right");
  });

  it("reads a two-column page one column after the other", () => {
    const items = [...column("L", 40, 8, 230), ...column("R", 330, 8, 230)];
    const text = itemsToText(items, PAGE).split("\n");
    expect(text).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `L${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `R${i + 1}`),
    ]);
  });

  it("reads a narrow left sidebar before the main column", () => {
    const items = [...column("S", 30, 6, 120), ...column("M", 200, 10, 360)];
    const text = itemsToText(items, PAGE).split("\n");
    expect(text.slice(0, 6)).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(text[6]).toBe("M1");
  });

  it("keeps a full-width header first and above both columns", () => {
    const header = item("Jane Doe Senior Engineer", 40, 740, 520);
    const items = [header, ...column("L", 40, 6, 230), ...column("R", 330, 6, 230)];
    const text = itemsToText(items, PAGE).split("\n");
    expect(text[0]).toBe("Jane Doe Senior Engineer");
    expect(text.indexOf("L6")).toBeLessThan(text.indexOf("R1"));
  });

  it("finds the columns under a centered header that crosses the gutter", () => {
    const header = item("Jane Doe, Senior Engineer", 175, 740, 250);
    const items = [header, ...column("L", 40, 6, 230), ...column("R", 330, 6, 230)];
    const text = itemsToText(items, PAGE).split("\n");
    expect(text[0]).toBe("Jane Doe, Senior Engineer");
    expect(text.indexOf("L6")).toBeLessThan(text.indexOf("R1"));
  });

  it("does not split a single column whose lines have right-aligned dates", () => {
    const items: PdfTextItem[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 700 - i * 14;
      items.push(item(`Role${i}`, 40, y, 100), item(`20${10 + i}`, 520, y, 40));
      // A bullet line that runs under the gap, as real resumes have.
      items.push(item(`Bullet${i} runs across the page`, 40, y - 7, 500));
    }
    const lines = itemsToText(items, PAGE).split("\n");
    expect(lines[0]).toBe("Role0 2010");
    expect(lines[1]).toBe("Bullet0 runs across the page");
  });

  it("ignores items that are only whitespace on their own", () => {
    expect(itemsToText([item("   ", 10, 10), item("Hi", 10, 30)], PAGE)).toBe("Hi");
  });
});

describe("assembleResume", () => {
  it("joins pages with a blank line and trims trailing space", () => {
    const result = assembleResume([`${"A".repeat(60)}  \n`, "B".repeat(60)]);
    expect(result).toEqual({
      ok: true,
      text: `${"A".repeat(60)}\n\n${"B".repeat(60)}`,
      truncated: false,
    });
  });

  it("collapses runs of blank lines and strips control characters", () => {
    const result = assembleResume([`${"x".repeat(30)}\n\n\n\n${"y".repeat(30)}\u0000\u0007`]);
    expect(result).toEqual({
      ok: true,
      text: `${"x".repeat(30)}\n\n${"y".repeat(30)}`,
      truncated: false,
    });
  });

  it("reports a PDF with almost no text as having no text layer", () => {
    expect(assembleResume(["", "  \n ", "ab"])).toEqual({ ok: false, reason: "no-text" });
    expect(assembleResume([])).toEqual({ ok: false, reason: "no-text" });
  });

  it("truncates to the request limit and says so", () => {
    const result = assembleResume(["word ".repeat(LIMITS.resumeChars)]);
    if (!result.ok) throw new Error("expected text");
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(LIMITS.resumeChars);
  });

  it("does not split a surrogate pair when truncating", () => {
    const result = assembleResume(["😀".repeat(LIMITS.resumeChars)]);
    if (!result.ok) throw new Error("expected text");
    expect(result.text.endsWith("😀")).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(LIMITS.resumeChars);
  });
});

describe("resumeTagSchema", () => {
  it("accepts presets and custom names, trimmed", () => {
    expect(resumeTagSchema.parse("  fde ")).toBe("fde");
    expect(resumeTagSchema.parse("Platform / infra")).toBe("Platform / infra");
  });

  it.each(["", "   ", "a\nb", "a\u0000b", "x".repeat(LIMITS.shortTextChars + 1)])(
    "rejects %j",
    (value) => {
      expect(resumeTagSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("storedResumeSchema", () => {
  const valid = {
    id: "3f0c2c9e-0a53-4b38-9d52-8f2f0a8f6f11",
    name: "resume.pdf",
    track: "sde",
    region: "master",
    text: "Some resume text",
    charCount: 16,
    pageCount: 2,
    truncated: false,
    createdAt: "2026-10-29T00:00:00.000Z",
  };

  it("accepts a valid record", () => {
    expect(storedResumeSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown keys, empty text and bad ids", () => {
    expect(storedResumeSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(storedResumeSchema.safeParse({ ...valid, text: "" }).success).toBe(false);
    expect(storedResumeSchema.safeParse({ ...valid, id: "../x" }).success).toBe(false);
    expect(storedResumeSchema.safeParse({ ...valid, track: "a\nb" }).success).toBe(false);
  });
});
