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
