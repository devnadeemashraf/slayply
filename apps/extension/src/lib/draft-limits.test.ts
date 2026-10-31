import { LIMITS } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { draftLimits } from "./draft-limits.js";
import type { QuestionRow } from "./question-rows.js";

const row = (id: string, maxChars?: number): QuestionRow => ({
  id,
  text: "Why?",
  checked: true,
  maxChars: maxChars ?? null,
});

describe("draftLimits", () => {
  it("uses each question's own limit and ignores empty or invalid ones", () => {
    const result = draftLimits({
      kind: "answers",
      draftLimit: "500",
      rows: [row("q1", 300), row("q2"), row("q3", 0), row("q4", -5)],
    });
    expect(result.limits).toEqual({ q1: 300 });
  });

  it("gives a draft kind its limit, keyed by the kind's output", () => {
    const result = draftLimits({ kind: "cover_letter", draftLimit: "1200", rows: [] });
    expect(result.limitOk).toBe(true);
    expect(result.limits).toEqual({ cover_letter: 1200 });
  });

  it("keys a relocation note by its kind, since its task is the shared 'answers'", () => {
    expect(draftLimits({ kind: "relocation", draftLimit: "400", rows: [] }).limits).toEqual({
      relocation: 400,
    });
  });

  it("accepts a blank limit as 'none' without calling it valid", () => {
    const result = draftLimits({ kind: "cover_letter", draftLimit: "  ", rows: [] });
    expect(result.limits).toEqual({});
    expect(result.limitOk).toBe(false);
    expect(result.blank).toBe(true);
  });

  it.each(["0", "-3", "1.5", "abc", String(LIMITS.questionMaxChars + 1)])(
    "rejects %s as a draft limit",
    (draftLimit) => {
      const result = draftLimits({ kind: "cover_letter", draftLimit, rows: [] });
      expect(result.limitOk).toBe(false);
      expect(result.blank).toBe(false);
      expect(result.limits).toEqual({});
    },
  );

  it("accepts the maximum", () => {
    expect(
      draftLimits({ kind: "cover_letter", draftLimit: String(LIMITS.questionMaxChars), rows: [] })
        .limitOk,
    ).toBe(true);
  });

  it("never applies a draft limit to the answers kind", () => {
    expect(draftLimits({ kind: "answers", draftLimit: "300", rows: [] }).limits).toEqual({});
  });
});
