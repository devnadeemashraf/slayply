import { describe, expect, it } from "vitest";
import { checkFitMatches, suggestResume } from "./fit-check.js";
import type { FitCheck } from "./schema.js";

const PROFILE = {
  facts: [
    { id: "F01", text: "Built the billing system." },
    { id: "F02", text: "Led a team of five." },
  ],
  stories: [{ id: "S01", text: "Cut deploy time from 40 to 8 minutes." }],
};

function fitWith(matches: FitCheck["matches"]): FitCheck {
  return {
    matches,
    gaps: [],
    chance: "medium",
    reason: "Close.",
    resume: { track: "sde", region: "us" },
    dealBreakers: [],
  };
}

describe("checkFitMatches", () => {
  it("marks a match cited when every listed ID is in the profile, and returns the fact text", () => {
    const [row] = checkFitMatches(
      fitWith([{ want: "Billing", have: "Built billing", factIds: ["F01", "S01"] }]),
      PROFILE,
    );
    expect(row?.status).toBe("cited");
    expect(row?.cited).toEqual([
      { id: "F01", text: "Built the billing system." },
      { id: "S01", text: "Cut deploy time from 40 to 8 minutes." },
    ]);
    expect(row?.invalidIds).toEqual([]);
  });

  it("flags a match with no IDs as uncited", () => {
    const [row] = checkFitMatches(
      fitWith([{ want: "Go", have: "Knows Go", factIds: [] }]),
      PROFILE,
    );
    expect(row?.status).toBe("uncited");
  });

  it("flags a match whose only IDs are unknown, and reports them", () => {
    const [row] = checkFitMatches(
      fitWith([{ want: "Go", have: "Knows Go", factIds: ["F99"] }]),
      PROFILE,
    );
    expect(row?.status).toBe("uncited");
    expect(row?.invalidIds).toEqual(["F99"]);
    expect(row?.cited).toEqual([]);
  });

  it("keeps a match cited when at least one ID is valid, and still reports the bad one", () => {
    const [row] = checkFitMatches(
      fitWith([{ want: "x", have: "y", factIds: ["F02", "F77"] }]),
      PROFILE,
    );
    expect(row?.status).toBe("cited");
    expect(row?.invalidIds).toEqual(["F77"]);
  });

  it("does not trust inherited keys as IDs", () => {
    const [row] = checkFitMatches(
      fitWith([{ want: "x", have: "y", factIds: ["__proto__", "constructor"] }]),
      PROFILE,
    );
    expect(row?.status).toBe("uncited");
  });

  it("returns an empty list for no matches", () => {
    expect(checkFitMatches(fitWith([]), PROFILE)).toEqual([]);
  });
});

const RESUMES = [
  { id: "a", track: "sde", region: "us", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "b", track: "SDE", region: "eu", createdAt: "2026-02-01T00:00:00.000Z" },
  { id: "c", track: "fde", region: "us", createdAt: "2026-03-01T00:00:00.000Z" },
];

describe("suggestResume", () => {
  it("picks the resume matching track and region, ignoring case and spacing", () => {
    expect(suggestResume({ track: " SDE ", region: "US" }, RESUMES)?.id).toBe("a");
  });

  it("falls back to the newest resume with the same track when the region differs", () => {
    expect(suggestResume({ track: "sde", region: "apac" }, RESUMES)?.id).toBe("b");
  });

  it("returns null when no resume has that track", () => {
    expect(suggestResume({ track: "pm", region: "us" }, RESUMES)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(suggestResume({ track: "sde", region: "us" }, [])).toBeNull();
  });

  it("prefers the newest when two resumes share track and region", () => {
    const twins = [
      { id: "old", track: "sde", region: "us", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", track: "sde", region: "us", createdAt: "2026-05-01T00:00:00.000Z" },
    ];
    expect(suggestResume({ track: "sde", region: "us" }, twins)?.id).toBe("new");
  });
});
