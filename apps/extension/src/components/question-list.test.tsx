import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuestionRow } from "../lib/question-rows.js";
import { QuestionList } from "./question-list.js";

const noop = () => {};
const rows: QuestionRow[] = [
  { id: "q1", text: "Why us?", maxChars: 500, checked: true },
  { id: "q2", text: "Authorized to work?", maxChars: null, checked: false },
];
const base = {
  rows,
  running: false,
  onChange: noop,
  onRemove: noop,
  onAdd: noop,
  onGenerateOne: noop,
  onGenerateAll: noop,
};

describe("QuestionList", () => {
  it("shows each question editable with its limit and a per-row Generate", () => {
    const html = renderToString(<QuestionList {...base} />);
    expect(html).toContain("Why us?");
    expect(html).toContain('value="500"');
    expect(html.match(/aria-label="Generate answer for question/g)?.length).toBe(2);
  });

  it("counts the checked questions on the main button", () => {
    expect(renderToString(<QuestionList {...base} />)).toContain("Generate 1 answer");
    const both = rows.map((r) => ({ ...r, checked: true }));
    expect(renderToString(<QuestionList {...base} rows={both} />)).toContain("Generate 2 answers");
  });

  it("explains an empty list and disables Generate", () => {
    const html = renderToString(<QuestionList {...base} rows={[]} />);
    expect(html).toContain("No questions yet");
    expect(html).toContain("disabled");
  });

  it("disables generating while a run is in progress", () => {
    const html = renderToString(<QuestionList {...base} running />);
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("disables Add question at the contract's 50-question limit", () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      id: `q${i + 1}`,
      text: `Q${i}`,
      maxChars: null,
      checked: true,
    }));
    const html = renderToString(<QuestionList {...base} rows={full} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Add question/);
  });

  it("offers Add question and Remove", () => {
    const html = renderToString(<QuestionList {...base} />);
    expect(html).toContain("Add question");
    expect(html).toContain("Remove question 1");
  });
});
