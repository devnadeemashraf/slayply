import { describe, expect, it } from "vitest";
import {
  addRow,
  appendRow,
  type QuestionRow,
  removeRow,
  replaceWithDetected,
  rowsToQuestions,
  updateRow,
} from "./question-rows.js";

const detected = [
  { label: "Why us?", type: "longtext", required: true, maxChars: 500 },
  { label: "Authorized to work?", type: "choice", required: false, maxChars: null },
  { label: "Anything else?", type: "text", required: false, maxChars: null },
] as const;

describe("question rows", () => {
  it("builds rows from detected questions: free text checked, choices unchecked", () => {
    const rows = replaceWithDetected(detected);
    expect(rows.map((r) => [r.text, r.checked, r.maxChars])).toEqual([
      ["Why us?", true, 500],
      ["Authorized to work?", false, null],
      ["Anything else?", true, null],
    ]);
  });

  it("gives every row a unique id that is valid for the contract", () => {
    const ids = replaceWithDetected(detected).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[\w-]{1,64}$/);
  });

  it("never reuses an id after a row is removed", () => {
    let rows = replaceWithDetected(detected);
    const removed = rows[0]?.id;
    rows = removeRow(rows, removed ?? "");
    rows = addRow(rows);
    expect(rows.map((r) => r.id)).not.toContain(removed);
  });

  it("sends only checked, non-empty rows, trimmed", () => {
    const rows: QuestionRow[] = [
      { id: "q1", text: "  Why us?  ", maxChars: 500, checked: true },
      { id: "q2", text: "Skipped", maxChars: null, checked: false },
      { id: "q3", text: "   ", maxChars: null, checked: true },
    ];
    expect(rowsToQuestions(rows)).toEqual([{ id: "q1", text: "Why us?", maxChars: 500 }]);
  });

  it("can send a single row even when it is unchecked", () => {
    const rows: QuestionRow[] = [{ id: "q2", text: "Skipped", maxChars: null, checked: false }];
    expect(rowsToQuestions(rows, "q2")).toEqual([{ id: "q2", text: "Skipped" }]);
  });

  it("drops an invalid character limit instead of sending it", () => {
    const rows: QuestionRow[] = [
      { id: "q1", text: "A", maxChars: 0, checked: true },
      { id: "q2", text: "B", maxChars: -3, checked: true },
      { id: "q3", text: "C", maxChars: 1.5, checked: true },
      { id: "q4", text: "D", maxChars: 999_999, checked: true },
    ];
    expect(rowsToQuestions(rows).every((q) => !("maxChars" in q))).toBe(true);
  });

  it("appends a captured question once and checks it", () => {
    const once = appendRow([], "Tell us about a project");
    expect(once).toHaveLength(1);
    expect(appendRow(once, "  tell us about a project ")).toHaveLength(1);
    expect(once[0]?.checked).toBe(true);
  });

  it("updates one row without touching the others", () => {
    const rows = replaceWithDetected(detected);
    const next = updateRow(rows, rows[1]?.id ?? "", { checked: true, text: "Edited" });
    expect(next[1]).toMatchObject({ checked: true, text: "Edited" });
    expect(next[0]).toEqual(rows[0]);
  });

  it("starts new ids above a floor, so an id removed earlier is not reused", () => {
    expect(addRow([], "A", 5)[0]?.id).toBe("q6");
    expect(replaceWithDetected(detected, 9)[0]?.id).toBe("q10");
    expect(appendRow([], "B", 2)[0]?.id).toBe("q3");
  });

  it("clamps question text to the contract limit", () => {
    const long = "z".repeat(6_000);
    expect(addRow([], long)[0]?.text.length).toBe(5_000);
    expect(appendRow([], long)[0]?.text.length).toBe(5_000);
    expect(
      replaceWithDetected([{ label: long, type: "text", required: false, maxChars: null }])[0]?.text
        .length,
    ).toBe(5_000);
  });

  it("keeps at most 50 rows, the contract's limit", () => {
    let rows: QuestionRow[] = [];
    for (let i = 0; i < 60; i++) rows = appendRow(rows, `Question ${i}`);
    expect(rows).toHaveLength(50);
    expect(addRow(rows)).toHaveLength(50);
  });
});
