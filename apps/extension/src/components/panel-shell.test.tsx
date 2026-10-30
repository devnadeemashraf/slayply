import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRIVACY_STATEMENT, TRAINING_WARNING } from "../lib/privacy.js";
import { JobsTab } from "./jobs-tab.js";
import { OnboardingCards } from "./onboarding-cards.js";
import { SetupChecklist } from "./setup-checklist.js";

const noop = () => {};

describe("SetupChecklist", () => {
  it("lists open items with a button to the right tab and says the key is needed", () => {
    const html = renderToString(
      <SetupChecklist status={{ hasKey: false, hasProfile: true, hasResume: false }} onGo={noop} />,
    );
    expect(html).toContain("API key");
    expect(html).toContain("needed to draft");
    expect(html).toContain("Resume");
    expect(html).toContain("Go to Setup");
  });

  it("renders nothing once everything is set up", () => {
    const html = renderToString(
      <SetupChecklist status={{ hasKey: true, hasProfile: true, hasResume: true }} onGo={noop} />,
    );
    expect(html).toBe("");
  });
});

describe("OnboardingCards", () => {
  it("shows the privacy statement first, with Next and no accept", () => {
    const html = renderToString(
      <OnboardingCards step={0} onNext={noop} onBack={noop} onAccept={noop} />,
    );
    expect(html).toContain(PRIVACY_STATEMENT.slice(0, 40));
    expect(html).toContain("Next");
    expect(html).not.toContain("I understand");
  });

  it("shows the training warning last, with Back and the accept button", () => {
    const html = renderToString(
      <OnboardingCards step={1} onNext={noop} onBack={noop} onAccept={noop} />,
    );
    expect(html).toContain(TRAINING_WARNING.slice(0, 40));
    expect(html).toContain("Back");
    expect(html).toContain("I understand");
  });

  it("shows an error beside the accept button", () => {
    const html = renderToString(
      <OnboardingCards
        step={1}
        error="Storage is full."
        onNext={noop}
        onBack={noop}
        onAccept={noop}
      />,
    );
    expect(html).toContain("Storage is full.");
  });
});

describe("JobsTab", () => {
  it("explains that saved jobs are not available yet", () => {
    const html = renderToString(<JobsTab />);
    expect(html).toContain("No saved jobs");
  });
});
