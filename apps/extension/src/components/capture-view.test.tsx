import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CaptureView, type CaptureViewProps } from "./capture-view.js";

const noop = () => {};
const base: CaptureViewProps = {
  draft: null,
  error: null,
  busy: false,
  job: { title: "", company: "", location: "", salary: "" },
  notes: "",
  paste: "",
  onCapture: noop,
  onUseQuestion: noop,
  questions: [],
  onDraftKind: noop,
  onDraftText: noop,
  onUse: noop,
  onDiscard: noop,
  onJobChange: noop,
  onNotesChange: noop,
  onPasteChange: noop,
  onPasteAdd: noop,
};

describe("CaptureView", () => {
  it("offers one capture button and a paste box", () => {
    const html = renderToString(<CaptureView {...base} />);
    expect(html).toContain("Capture this job");
    expect(html).toContain("Paste text");
  });

  it("shows a staged capture with its kind and editable text", () => {
    const html = renderToString(
      <CaptureView
        {...base}
        draft={{ kind: "question", text: "Why us?", url: "https://example.com/" }}
      />,
    );
    expect(html).toContain("Why us?");
    expect(html).toContain("Use as question");
    expect(html).toContain("https://example.com/");
  });

  it("shows the job fields as editable inputs", () => {
    const html = renderToString(
      <CaptureView
        {...base}
        job={{ title: "Engineer", company: "Acme", location: "Berlin", salary: "€90k" }}
      />,
    );
    for (const value of ["Engineer", "Acme", "Berlin", "€90k"]) expect(html).toContain(value);
  });

  it("lists detected questions with their limits and a Use button", () => {
    const html = renderToString(
      <CaptureView
        {...base}
        questions={[
          { label: "Why us?", type: "longtext", required: true, maxChars: 500 },
          { label: "Authorized to work?", type: "choice", required: false, maxChars: null },
        ]}
      />,
    );
    expect(html).toContain("Questions found (2)");
    expect(html).toContain("Why us?");
    expect(html).toContain("(required, max 500 characters)");
    expect(html).toContain("(choice)");
    expect(html.match(/>Use</g)?.length).toBe(2);
  });

  it("shows no question list when none were found", () => {
    expect(renderToString(<CaptureView {...base} />)).not.toContain("Questions found");
  });

  it("shows an error as an alert", () => {
    const html = renderToString(<CaptureView {...base} error="Nothing is selected." />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Nothing is selected.");
  });

  it("disables the capture button while one is running", () => {
    const html = renderToString(<CaptureView {...base} busy />);
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(1);
  });
});
