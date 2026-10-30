import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaleBanner } from "./stale-banner.js";

const noop = () => {};

describe("StaleBanner", () => {
  it("offers a capture and a dismiss, and names the old page's host", () => {
    const html = renderToString(
      <StaleBanner host="boards.greenhouse.io" busy={false} onCapture={noop} onDismiss={noop} />,
    );
    expect(html).toContain("boards.greenhouse.io");
    expect(html).toContain("Capture this page");
    expect(html).toContain("Dismiss");
  });

  it("disables the capture button while a capture runs", () => {
    const html = renderToString(
      <StaleBanner host="" busy={true} onCapture={noop} onDismiss={noop} />,
    );
    expect(html).toContain("disabled");
  });

  it("escapes a hostile host", () => {
    const html = renderToString(
      <StaleBanner host="<img src=x onerror=1>" busy={false} onCapture={noop} onDismiss={noop} />,
    );
    expect(html).not.toContain("<img");
  });
});
