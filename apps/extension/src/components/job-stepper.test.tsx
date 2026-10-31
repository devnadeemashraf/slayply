import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { screenSteps } from "../lib/job-screens.js";
import { JobStepper } from "./job-stepper.js";

const progress = { hasJd: true, fitDone: false, answered: false, running: false };

describe("JobStepper with navigation", () => {
  it("makes enterable steps buttons, but not the current or locked ones", () => {
    const html = renderToString(
      <JobStepper steps={screenSteps("questions", progress)} onSelect={() => {}} />,
    );
    // Capture is enterable (button); Questions is current; Answers is locked.
    expect(html.match(/<button/g)).toHaveLength(1);
    const button = html.slice(html.indexOf("<button"), html.indexOf("</button>"));
    expect(button).toContain("Capture");
    expect(html).toContain('aria-current="step"');
  });

  it("renders plain text when no handler is given", () => {
    const html = renderToString(<JobStepper steps={screenSteps("capture", progress)} />);
    expect(html).not.toContain("<button");
  });
});
