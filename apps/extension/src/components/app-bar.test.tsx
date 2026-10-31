import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppBar } from "./app-bar.js";

const noop = () => {};
const status = { phase: "awake", label: "Relay ready", offerDirectMode: false } as const;

describe("AppBar", () => {
  it("shows the brand, the relay status and the chip slot", () => {
    const html = renderToString(
      <AppBar status={status} theme="auto" onTheme={noop} chip={<span>Gemini 2.5</span>} />,
    );
    expect(html).toContain("<h1");
    expect(html).toContain("Slayply");
    expect(html).toContain("Relay ready");
    expect(html).toContain('role="status"');
    expect(html).toContain("Gemini 2.5");
  });

  it("leaves the chip slot out when none is given", () => {
    expect(renderToString(<AppBar status={status} theme="auto" onTheme={noop} />)).not.toContain(
      "app-bar-chip",
    );
  });

  it.each([
    ["auto", "Theme: match system. Switch to light"],
    ["light", "Theme: light. Switch to dark"],
    ["dark", "Theme: dark. Switch to match system"],
  ] as const)("names the %s theme and the one a click selects", (theme, label) => {
    const html = renderToString(<AppBar status={status} theme={theme} onTheme={noop} />);
    expect(html).toContain(`aria-label="${label}"`);
  });

  it("does not rely on colour alone for the status", () => {
    const html = renderToString(
      <AppBar
        status={{ phase: "unreachable", label: "Relay unreachable", offerDirectMode: true }}
        theme="auto"
        onTheme={noop}
      />,
    );
    expect(html).toContain("Relay unreachable");
    expect(html).toContain('aria-hidden="true"');
  });
});
