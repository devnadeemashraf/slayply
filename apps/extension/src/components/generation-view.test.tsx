import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GenerationState } from "../lib/generate-controller.js";
import { GenerationView } from "./generation-view.js";

function render(state: GenerationState, copy: "idle" | "copied" | "failed" = "idle"): string {
  return renderToString(<GenerationView state={state} copyState={copy} onCopy={() => {}} />);
}

const DONE: GenerationState = {
  phase: "done",
  attempts: 1,
  response: {
    outputs: [
      {
        id: "q1",
        label: "Answer",
        text: "I build <b>things</b> & ship.",
        claims: [],
        charCount: 28,
      },
    ],
    warnings: ["No resume or profile was provided, so this answer is generic."],
  },
};

describe("GenerationView", () => {
  it("renders nothing for idle", () => {
    expect(render({ phase: "idle" })).toBe("");
  });

  it("shows the live preview as a draft with Copy disabled", () => {
    const html = render({ phase: "streaming", attempt: 1, preview: "Working on it" });
    expect(html).toContain("Working on it");
    expect(html).toMatch(/Drafting/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Copy/);
  });

  it("says which attempt is running on the retry", () => {
    const html = render({ phase: "streaming", attempt: 2, preview: "" });
    expect(html).toContain("Reformatting answer, attempt 2 of 2");
  });

  it("shows the validated answer, its warnings and an enabled Copy button", () => {
    const html = render(DONE);
    expect(html).toContain("&amp; ship.");
    expect(html).toContain("this answer is generic");
    expect(html).not.toMatch(/<button[^>]*disabled/);
    expect(html).toContain("Copy to Clipboard");
  });

  it("escapes model output instead of inserting it as HTML", () => {
    const html = render(DONE);
    expect(html).toContain("&lt;b&gt;things&lt;/b&gt;");
    expect(html).not.toContain("<b>things</b>");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("gives visible feedback after copying, and when copying fails", () => {
    expect(render(DONE, "copied")).toContain("Copied!");
    expect(render(DONE, "failed")).toContain("Copy failed");
  });

  it("labels the raw fallback as unvalidated and still allows Copy", () => {
    const html = render({ phase: "raw", rawText: "{not json", issues: [] });
    expect(html).toContain("{not json");
    expect(html).toContain("Unvalidated");
    expect(html).not.toMatch(/<button[^>]*disabled/);
  });

  it("shows an error message as an alert", () => {
    const html = render({
      phase: "error",
      message: "The provider rejected the API key",
      code: "UPSTREAM_AUTH",
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("The provider rejected the API key");
  });
});
