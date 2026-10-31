import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionBar } from "./action-bar.js";

const noop = () => {};

describe("ActionBar", () => {
  it("ties the disabled button to the reason shown beside it", () => {
    const html = renderToString(
      <ActionBar
        action={{
          kind: "fit",
          label: "Check my fit",
          disabled: true,
          hint: "Add a job description first.",
        }}
        onFit={noop}
        onAnswers={noop}
        onStop={noop}
      />,
    );
    expect(html).toContain('id="action-hint"');
    expect(html).toContain('aria-describedby="action-hint"');
    expect(html).toContain("Add a job description first.");
  });

  it("has no description when there is no hint", () => {
    const html = renderToString(
      <ActionBar
        action={{ kind: "fit", label: "Check my fit", disabled: false }}
        onFit={noop}
        onAnswers={noop}
        onStop={noop}
      />,
    );
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("action-hint");
  });
});
