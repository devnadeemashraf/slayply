import { describe, expect, it } from "vitest";
import { buildJobDraft } from "./job-draft.js";
import type { GenerationState } from "./generate-controller.js";

const OUT = (id: string, text: string) => ({
  id,
  label: `Label ${id}`,
  text,
  claims: [],
  charCount: text.length,
});
const done = (outputs: ReturnType<typeof OUT>[]): GenerationState => ({
  phase: "done",
  attempts: 1,
  profile: { facts: [], stories: [] },
  response: { outputs, warnings: [] },
});
const ROWS = [
  { id: "q1", text: "Why us?", checked: true },
  { id: "q2", text: "Salary?", checked: true },
] as never[];
const JOB = { title: "BE", company: "Acme", location: "Remote" };

describe("buildJobDraft", () => {
  it("pairs each output with its question text", () => {
    const draft = buildJobDraft({
      job: JOB,
      jd: "JD",
      resumeName: "cv",
      rows: ROWS,
      state: done([OUT("q1", "Because."), OUT("q2", "100k.")]),
      edits: {},
    });
    expect(draft.answers).toEqual([
      { question: "Why us?", text: "Because." },
      { question: "Salary?", text: "100k." },
    ]);
  });

  it("uses the user's edited text and falls back to the output label for an unknown question", () => {
    const draft = buildJobDraft({
      job: JOB,
      jd: "JD",
      resumeName: "",
      rows: ROWS,
      state: done([OUT("q1", "Raw."), OUT("zz", "Other.")]),
      edits: { q1: "Edited." },
    });
    expect(draft.answers).toEqual([
      { question: "Why us?", text: "Edited." },
      { question: "Label zz", text: "Other." },
    ]);
  });

  it("has no answers before a generation is done, and skips empty text", () => {
    const base = { job: JOB, jd: "JD", resumeName: "", rows: ROWS, edits: {} };
    expect(buildJobDraft({ ...base, state: { phase: "idle" } }).answers).toEqual([]);
    expect(buildJobDraft({ ...base, state: done([OUT("q1", "  ")]) }).answers).toEqual([]);
  });

  it("clips fields to the stored limits so a save cannot fail on length", () => {
    const draft = buildJobDraft({
      job: { title: "t".repeat(900), company: "c", location: "l" },
      jd: "x".repeat(70_000),
      resumeName: "r",
      rows: ROWS,
      state: { phase: "idle" },
      edits: {},
    });
    expect(draft.title.length).toBeLessThanOrEqual(500);
    expect(draft.jd.length).toBeLessThanOrEqual(60_000);
  });
});
