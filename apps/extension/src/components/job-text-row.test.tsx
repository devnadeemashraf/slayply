import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobTextRow } from "./job-text-row.js";

const noop = () => {};

describe("JobTextRow", () => {
  it("summarises the text instead of showing it, with an Edit button", () => {
    const html = renderToString(
      <JobTextRow jd="Build billing systems." max={60_000} onChange={noop} />,
    );
    expect(html).toContain("22 characters");
    expect(html).toMatch(/<button[^>]*>Edit<\/button>/);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Build billing systems.");
  });

  it("offers to add text when there is none", () => {
    const html = renderToString(<JobTextRow jd="" max={60_000} onChange={noop} />);
    expect(html).toContain("No job description yet");
    expect(html).toMatch(/<button[^>]*>Add<\/button>/);
  });

  it("opens a dialog with the text field, limited in length", () => {
    const html = renderToString(
      <JobTextRow jd="Build billing systems." max={60_000} onChange={noop} initialOpen />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toMatch(/<textarea[^>]*maxLength="60000"/);
    expect(html).toContain("Build billing systems.");
  });

  it("renders the text as plain text, never markup", () => {
    const html = renderToString(
      <JobTextRow jd={"<img src=x onerror=alert(1)>"} max={60_000} onChange={noop} initialOpen />,
    );
    expect(html).not.toContain("<img");
  });
});
