import type { FitCheck } from "@slayply/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { stageLabel } from "../lib/activity.js";
import type { GenerationState } from "../lib/generate-controller.js";
import { type FitResult, FitView } from "./fit-view.js";

const FIT: FitCheck = {
  matches: [
    { want: "Billing systems", have: "Built the billing system", factIds: ["F01"] },
    { want: "Rust", have: "Loves Rust <b>a lot</b>", factIds: ["F99"] },
  ],
  gaps: ["No on-call experience"],
  chance: "medium",
  reason: "Strong backend match.",
  resume: { track: "sde", region: "us" },
  dealBreakers: ["Must relocate to Berlin"],
  salaryAnswer: "I am looking for 120k to 140k.",
};

const RESULT: FitResult = {
  fit: FIT,
  profile: { facts: [{ id: "F01", text: "Built the billing system." }], stories: [] },
  cached: false,
};

const RESUME = {
  id: "r1",
  name: "cv.pdf",
  track: "sde",
  region: "us",
  text: "x",
  charCount: 1,
  pageCount: 1,
  truncated: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function render(
  state: GenerationState,
  result: FitResult | null = null,
  suggestion: { resume: typeof RESUME; active: boolean } | null = null,
): string {
  return renderToString(
    <FitView
      state={state}
      result={result}
      suggestion={suggestion}
      onUseResume={() => {}}
      onRerun={() => {}}
    />,
  );
}

describe("FitView", () => {
  it("renders nothing while idle with no result", () => {
    expect(render({ phase: "idle" })).toBe("");
  });

  it("shows a progress line while checking", () => {
    const html = render({
      phase: "streaming",
      attempt: 1,
      preview: "",
      stage: "waiting",
      startedAt: 0,
    });
    expect(html).toContain(stageLabel("waiting", 1));
  });

  it("shows the chance, reason, gaps, deal-breakers and salary answer", () => {
    const html = render({ phase: "idle" }, RESULT);
    expect(html).toMatch(/medium/i);
    expect(html).toContain("Strong backend match.");
    expect(html).toContain("No on-call experience");
    expect(html).toContain("Must relocate to Berlin");
    expect(html).toContain("I am looking for 120k to 140k.");
  });

  it("shows the match table with the cited fact text", () => {
    const html = render({ phase: "idle" }, RESULT);
    expect(html).toContain("Billing systems");
    expect(html).toContain("Built the billing system");
    expect(html).toContain("F01");
  });

  it("marks a match with no valid citation and never renders model text as HTML", () => {
    const html = render({ phase: "idle" }, RESULT);
    expect(html).toMatch(/no matching fact/i);
    expect(html).not.toContain("<b>a lot</b>");
    expect(html).toContain("&lt;b&gt;a lot&lt;/b&gt;");
  });

  it("says when the result was saved earlier and offers a re-run", () => {
    const html = render({ phase: "idle" }, { ...RESULT, cached: true });
    expect(html).toMatch(/saved result/i);
    expect(html).toMatch(/run again/i);
  });

  it("names the recommended track and region, and offers the matching resume", () => {
    const html = render({ phase: "idle" }, RESULT, { resume: RESUME, active: false });
    expect(html).toContain("sde");
    expect(html).toContain("cv.pdf");
    expect(html).toMatch(/use this resume/i);
  });

  it("does not offer a resume that is already selected", () => {
    const html = render({ phase: "idle" }, RESULT, { resume: RESUME, active: true });
    expect(html).not.toMatch(/use this resume/i);
    expect(html).toMatch(/selected/i);
  });

  it("says no saved resume matches when there is no suggestion", () => {
    expect(render({ phase: "idle" }, RESULT, null)).toMatch(/no saved resume/i);
  });

  it("shows an error as an alert", () => {
    const html = render({ phase: "error", message: "Relay is down", code: "UPSTREAM" });
    expect(html).toContain("Relay is down");
    expect(html).toContain('role="alert"');
  });

  it("explains a timeout and offers to try again", () => {
    const html = render({
      phase: "error",
      message: "The generation took too long",
      code: "STREAM_TIMEOUT",
    });
    expect(html).toMatch(/2 minutes/);
    expect(html).toContain("Try again");
  });

  it("tells a Direct Mode user nothing about picking another model", () => {
    const html = renderToString(
      <FitView
        state={{ phase: "error", message: "x", code: "UPSTREAM_OVERLOADED" }}
        result={null}
        suggestion={null}
        onUseResume={() => {}}
        onRerun={() => {}}
        direct
      />,
    );
    expect(html).toContain("overloaded");
    expect(html).not.toMatch(/another model/);
  });

  it("offers no retry when the key was rejected", () => {
    const html = render({
      phase: "error",
      message: "The provider rejected the API key",
      code: "UPSTREAM_AUTH",
    });
    expect(html).not.toContain("Try again");
  });

  it("shows an unusable reply as unvalidated text", () => {
    const html = render({ phase: "raw", rawText: "not json", issues: [] });
    expect(html).toMatch(/unvalidated/i);
    expect(html).toContain("not json");
  });

  it("omits the salary line and empty lists when the model gave none", () => {
    const bare = {
      ...RESULT,
      fit: { ...FIT, salaryAnswer: undefined, gaps: [], dealBreakers: [] },
    };
    const html = render({ phase: "idle" }, bare);
    expect(html).not.toMatch(/salary/i);
    expect(html).not.toMatch(/deal-breakers/i);
  });
});

describe("FitView compact", () => {
  function compact(initialDetailsOpen = false): string {
    return renderToString(
      <FitView
        state={{ phase: "idle" }}
        result={RESULT}
        suggestion={null}
        onUseResume={() => {}}
        onRerun={() => {}}
        compact
        initialDetailsOpen={initialDetailsOpen}
      />,
    );
  }

  it("shows only the chance, the reason and a Details button", () => {
    const html = compact();
    expect(html).toMatch(/medium/i);
    expect(html).toContain("Strong backend match.");
    expect(html).toMatch(/<button[^>]*>Details<\/button>/);
    expect(html).not.toContain("Deal-breakers");
    expect(html).not.toContain("No on-call experience");
  });

  it("opens the full result in a dialog", () => {
    const html = compact(true);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Deal-breakers");
    expect(html).toContain("No on-call experience");
    expect(html).toContain("I am looking for 120k to 140k.");
  });

  it("keeps escaping model text in the summary", () => {
    const hostile = { ...RESULT, fit: { ...FIT, reason: "<script>x</script>" } };
    const html = renderToString(
      <FitView
        state={{ phase: "idle" }}
        result={hostile}
        suggestion={null}
        onUseResume={() => {}}
        onRerun={() => {}}
        compact
      />,
    );
    expect(html).not.toContain("<script>");
  });
});
