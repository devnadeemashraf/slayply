import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SLOW_AFTER_MS, stageLabel } from "../lib/activity.js";
import { ActivityView } from "./activity-indicator.js";

function render(props: Partial<Parameters<typeof ActivityView>[0]> = {}): string {
  return renderToString(
    <ActivityView stage="waiting" attempt={1} elapsedMs={7_000} onCancel={() => {}} {...props} />,
  );
}

describe("ActivityView", () => {
  it("shows the stage, the elapsed time and a Cancel button", () => {
    const html = render();
    expect(html).toContain(stageLabel("waiting", 1));
    expect(html).toContain("0:07");
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
  });

  it("announces the stage politely but keeps the ticking clock out of the live region", () => {
    const html = render();
    expect(html).toMatch(/role="status"[^>]*>[^<]*Waiting/);
    expect(html).toMatch(/<time[^>]*aria-hidden="true"/);
  });

  it("adds the slow-run note only from 30 seconds on", () => {
    expect(render({ elapsedMs: SLOW_AFTER_MS - 1 })).not.toContain("longer than usual");
    expect(render({ elapsedMs: SLOW_AFTER_MS })).toContain("longer than usual");
  });

  it("names the second attempt", () => {
    expect(render({ attempt: 2 })).toContain("attempt 2 of 2");
  });

  it("leaves out Cancel when nothing can be cancelled", () => {
    expect(render({ onCancel: undefined })).not.toContain("Cancel");
  });
});
