import type { FitCheck } from "@slayply/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GenerationState } from "../lib/generate-controller.js";
import { primaryAction } from "../lib/job-steps.js";
import { ActionBar } from "./action-bar.js";
import { CharRing } from "./char-ring.js";
import { FitView } from "./fit-view.js";
import { GenerationView } from "./generation-view.js";
import { JobStepper } from "./job-stepper.js";
import { PresetPicker } from "./preset-picker.js";

const noop = () => {};

const DONE_FOR_COPY: GenerationState = {
  phase: "done",
  attempts: 1,
  profile: { facts: [], stories: [] },
  response: {
    outputs: [{ id: "q1", label: "Answer", text: "Hello.", claims: [], charCount: 6 }],
    warnings: [],
  },
};
const idle = { hasJd: false, fitDone: false, answered: false, fitRunning: false, running: false };

describe("micro-interaction hooks in markup", () => {
  it("stamps the check on a finished step only", () => {
    const html = renderToString(
      <JobStepper
        steps={[
          { id: "capture", label: "Capture", state: "done" },
          { id: "fit", label: "Fit", state: "current" },
          { id: "answers", label: "Answers", state: "todo" },
        ]}
      />,
    );
    expect(html.match(/step-mark/g)).toHaveLength(3);
    expect(html).toMatch(/step-done[^>]*><span class="step-mark"[^>]*>✓/);
  });

  it("pops the copy button and adds a check once copied, keeping the text", () => {
    const state: GenerationState = DONE_FOR_COPY;
    const html = renderToString(
      <GenerationView state={state} copyState="copied" onCopy={noop} edits={{}} onEdit={noop} />,
    );
    expect(html).toContain("sl-pop");
    expect(html).toContain("Copied!");
    expect(html).toContain("✓");
  });

  it("does not pop an idle copy button", () => {
    const html = renderToString(
      <GenerationView
        state={DONE_FOR_COPY}
        copyState="idle"
        onCopy={noop}
        edits={{}}
        onEdit={noop}
      />,
    );
    expect(html).not.toContain("sl-pop");
    expect(html).not.toContain("✓");
  });
});

describe("PresetPicker", () => {
  it("lists the three presets and marks only the current one pressed", () => {
    const html = renderToString(<PresetPicker value="bubblegum" onChange={noop} />);
    expect(html).toContain("Neon");
    expect(html).toContain("Bubblegum");
    expect(html).toContain("Brutal");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Bubblegum|Bubblegum[^<]*<\/button>/);
  });

  it("is a labelled group", () => {
    const html = renderToString(<PresetPicker value="neon" onChange={noop} />);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend>Look</legend>");
    expect(html).toContain("Look");
  });
});

describe("JobStepper", () => {
  it("lists the three steps in order and marks the current one", () => {
    const html = renderToString(
      <JobStepper
        steps={[
          { id: "capture", label: "Capture", state: "done" },
          { id: "fit", label: "Fit", state: "current" },
          { id: "answers", label: "Answers", state: "todo" },
        ]}
      />,
    );
    expect(html.indexOf("Capture")).toBeLessThan(html.indexOf("Fit"));
    expect(html.indexOf("Fit")).toBeLessThan(html.indexOf("Answers"));
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  });

  it("says in text which steps are done", () => {
    const html = renderToString(
      <JobStepper
        steps={[
          { id: "capture", label: "Capture", state: "done" },
          { id: "fit", label: "Fit", state: "current" },
          { id: "answers", label: "Answers", state: "todo" },
        ]}
      />,
    );
    expect(html).toContain("done");
  });
});

describe("ActionBar", () => {
  it("shows the label and a disabled button with the reason", () => {
    const html = renderToString(
      <ActionBar
        action={primaryAction({ ...idle, questionCount: 0 })}
        onFit={noop}
        onAnswers={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain("Check my fit");
    expect(html).toContain("disabled");
    expect(html).toMatch(/job description/i);
  });

  it("shows an enabled primary button when ready", () => {
    const html = renderToString(
      <ActionBar
        action={primaryAction({ ...idle, hasJd: true, fitDone: true, questionCount: 2 })}
        onFit={noop}
        onAnswers={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain("Write 2 answers");
    expect(html).not.toContain("disabled");
    expect(html).toContain("sl-btn-primary");
  });

  it("shows Stop as a secondary button while running", () => {
    const html = renderToString(
      <ActionBar
        action={primaryAction({ ...idle, hasJd: true, running: true, questionCount: 1 })}
        onFit={noop}
        onAnswers={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain("Stop");
    expect(html).toContain("sl-btn-secondary");
  });
});

describe("CharRing", () => {
  it("shows the count as text, not only as a ring", () => {
    const html = renderToString(<CharRing length={120} max={300} />);
    expect(html).toContain("120 / 300");
  });

  it("says when the answer is over the limit", () => {
    const html = renderToString(<CharRing length={320} max={300} />);
    expect(html).toContain("320 / 300");
    expect(html).toContain("over");
  });

  it("renders nothing without a limit", () => {
    expect(renderToString(<CharRing length={10} max={undefined} />)).toBe("");
  });
});

const DONE: GenerationState = {
  phase: "done",
  attempts: 1,
  profile: { facts: [{ id: "F01", text: "Built the billing system." }], stories: [] },
  response: {
    outputs: [
      {
        id: "q1",
        label: "Why us?",
        text: "I built billing.",
        claims: [{ sentence: "I built billing.", factIds: ["F01"] }],
        charCount: 16,
      },
      { id: "q2", label: "Tell us more", text: "Happy to.", claims: [], charCount: 9 },
    ],
    warnings: [],
  },
};

describe("GenerationView on the new design", () => {
  const render = (limits?: Record<string, number>) =>
    renderToString(
      <GenerationView
        state={DONE}
        copyState="idle"
        onCopy={noop}
        edits={{}}
        onEdit={noop}
        limits={limits}
      />,
    );

  it("puts each answer in its own card", () => {
    expect(render().match(/class="sl-card"/g)).toHaveLength(2);
  });

  it("shows a character ring only for answers that have a limit", () => {
    const html = render({ q1: 100 });
    expect(html).toContain("16 / 100");
    expect(html).not.toContain("9 /");
  });

  it("turns each cited fact into an expandable receipt that keeps the fact text", () => {
    const html = render();
    expect(html).toContain("<details");
    expect(html).toMatch(/<summary[^>]*>.*F01/);
    expect(html).toContain("Built the billing system.");
  });

  it("uses the primary button for copy", () => {
    expect(render()).toContain("Copy to Clipboard");
  });
});

describe("FitView on the new design", () => {
  const FIT: FitCheck = {
    matches: [],
    gaps: [],
    chance: "low",
    reason: "Different stack.",
    resume: { track: "sde", region: "us" },
    dealBreakers: [],
    salaryAnswer: "",
  };

  it("shows the chance as a sticker badge with the level in text", () => {
    const html = renderToString(
      <FitView
        state={{ phase: "idle" }}
        result={{ fit: FIT, profile: { facts: [], stories: [] }, cached: false }}
        suggestion={null}
        onUseResume={noop}
        onRerun={noop}
      />,
    );
    expect(html).toContain("sl-sticker-bad");
    expect(html).toContain("Chance: low");
  });
});
