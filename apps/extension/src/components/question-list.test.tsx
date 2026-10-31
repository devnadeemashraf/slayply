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

describe("QuestionList: past answers", () => {
  const past = {
    q1: [
      {
        jobId: "a",
        company: "Acme",
        title: "BE",
        question: "Why us?",
        text: "Because <b>x</b>.",
        score: 1,
      },
    ],
  };

  it("offers earlier answers under the matching question, as plain text", () => {
    const html = renderToString(
      <QuestionList {...base} pastFor={(id) => past[id as "q1"] ?? []} onUsePast={noop} />,
    );
    expect(html).toContain("Earlier answer (1)");
    expect(html).toContain("Acme");
    expect(html).toContain("Because &lt;b&gt;x&lt;/b&gt;.");
    expect(html.match(/Earlier answer/g)).toHaveLength(1);
  });

  it("shows nothing when there are no past answers", () => {
    expect(renderToString(<QuestionList {...base} />)).not.toContain("Earlier answer");
  });

  it("keeps each row to its checkbox and text, with the limit and buttons under Options", () => {
    const html = renderToString(<QuestionList {...base} />);
    const rowsHtml = html.split("<li").slice(1);
    expect(rowsHtml).toHaveLength(2);
    for (const row of rowsHtml) {
      const options = row.indexOf("<details");
      expect(options).toBeGreaterThan(row.indexOf("<textarea"));
      expect(row.indexOf("Max characters")).toBeGreaterThan(options);
      expect(row.indexOf("Remove question")).toBeGreaterThan(options);
    }
  });

  it("keeps the main Generate button outside the Options and shows a set limit in their title", () => {
    const html = renderToString(<QuestionList {...base} />);
    expect(html).toContain("Options · up to 500 characters");
    const lastOptions = html.lastIndexOf("</details>");
    expect(html.indexOf("Generate 1 answer")).toBeGreaterThan(lastOptions);
  });
});
