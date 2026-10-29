import type { StoredResume } from "@slayply/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeListView, ResumePreviewView } from "./resume-view.js";

const noop = () => {};
const draft = {
  name: "cv.pdf",
  text: "Jane Doe <script>alert(1)</script>",
  pageCount: 2,
  truncated: false,
  track: "sde",
  region: "master",
};

const stored: StoredResume = {
  id: "r1",
  name: "cv.pdf",
  track: "fde",
  region: "gulf",
  text: "x",
  charCount: 1234,
  pageCount: 1,
  truncated: true,
  createdAt: "2026-10-29T00:00:00.000Z",
};

function preview(overrides: Partial<typeof draft> = {}) {
  return renderToString(
    <ResumePreviewView
      draft={{ ...draft, ...overrides }}
      onTrack={noop}
      onRegion={noop}
      onSave={noop}
      onCancel={noop}
    />,
  );
}

describe("ResumePreviewView", () => {
  it("shows the file, page and character counts and the extracted text escaped", () => {
    const html = preview();
    expect(html).toContain("cv.pdf");
    expect(html).toMatch(/2 pages/);
    expect(html).not.toContain("<script>");
  });

  it("shows the whole extracted text, not a cut-off", () => {
    const text = `${"a".repeat(4_000)}END`;
    expect(preview({ text })).toContain(text);
  });

  it("warns when the text was cut to fit", () => {
    expect(preview({ truncated: true })).toMatch(/cut off/);
    expect(preview()).not.toMatch(/cut off/);
  });

  it("offers preset and custom tags, and shows a box for a custom value", () => {
    const html = preview({ track: "Platform", region: "remote" });
    expect(html).toMatch(/Custom track/);
    expect(html).not.toMatch(/Custom region/);
  });

  it("disables Save while a tag is empty", () => {
    expect(preview({ track: "" })).toMatch(/<button[^>]*disabled[^>]*>Save resume/);
    expect(preview()).not.toMatch(/<button[^>]*disabled[^>]*>Save resume/);
  });
});

describe("ResumeListView", () => {
  it("invites an upload when empty", () => {
    expect(renderToString(<ResumeListView resumes={[]} onRemove={noop} />)).toMatch(
      /No resumes yet/,
    );
  });

  it("lists name, tags and size, and flags a cut resume", () => {
    const html = renderToString(<ResumeListView resumes={[stored]} onRemove={noop} />);
    expect(html).toContain("cv.pdf");
    expect(html).toContain("fde");
    expect(html).toContain("gulf");
    expect(html).toContain("1,234");
    expect(html).toMatch(/cut to fit/);
  });
});
