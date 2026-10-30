import { LIMITS } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { applyIncoming, type Incoming } from "./incoming.js";
import type { QuestionRow } from "./question-rows.js";

const old: QuestionRow[] = [{ id: "q1", text: "Job A question", maxChars: null, checked: true }];
const detected = [
  { label: "Why us?", type: "longtext", required: true, maxChars: 500 },
  { label: "Visa?", type: "choice", required: false, maxChars: null },
] as const;

describe("applyIncoming", () => {
  it("a page capture sets the job description, replaces the questions and resets the result", () => {
    const incoming: Incoming = {
      seq: 1,
      kind: "jd",
      text: "JD B",
      replaceAll: true,
      detected: [...detected],
    };
    const applied = applyIncoming(incoming, old, 1);
    expect(applied.jd).toBe("JD B");
    expect(applied.rows.map((r) => r.text)).toEqual(["Why us?", "Visa?"]);
    expect(applied.rows.map((r) => r.id)).not.toContain("q1");
    expect(applied.resetResult).toBe(true);
  });

  it("a page capture with no questions clears the old ones", () => {
    const incoming: Incoming = { seq: 1, kind: "jd", text: "JD B", replaceAll: true, detected: [] };
    expect(applyIncoming(incoming, old, 1).rows).toEqual([]);
  });

  it("a selection capture sets the job description and keeps the questions", () => {
    const incoming: Incoming = { seq: 2, kind: "jd", text: "JD", replaceAll: false, detected: [] };
    const applied = applyIncoming(incoming, old, 1);
    expect(applied.rows).toEqual(old);
    expect(applied.resetResult).toBe(true);
  });

  it("a captured question is added without touching the job description or the result", () => {
    const applied = applyIncoming({ seq: 3, kind: "question", text: "New one" }, old, 1);
    expect(applied.jd).toBeUndefined();
    expect(applied.rows.map((r) => r.text)).toEqual(["Job A question", "New one"]);
    expect(applied.resetResult).toBe(false);
  });

  it("clamps a very long job description and question to the contract's limits", () => {
    const jd = applyIncoming(
      {
        seq: 1,
        kind: "jd",
        text: "x".repeat(LIMITS.jdChars + 10),
        replaceAll: false,
        detected: [],
      },
      [],
      0,
    );
    expect(jd.jd?.length).toBe(LIMITS.jdChars);
    const q = applyIncoming(
      { seq: 2, kind: "question", text: "y".repeat(LIMITS.questionChars + 10) },
      [],
      0,
    );
    expect(q.rows[0]?.text.length).toBe(LIMITS.questionChars);
  });

  it("never reuses an id at or below the floor", () => {
    const applied = applyIncoming({ seq: 4, kind: "question", text: "Another" }, [], 7);
    expect(applied.rows[0]?.id).toBe("q8");
  });
});
