import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftControls } from "./draft-controls.js";

const noop = () => undefined;
const render = (over: Partial<Parameters<typeof DraftControls>[0]> = {}) =>
  renderToString(
    <DraftControls
      kind="answers"
      tone="crisp"
      length="medium"
      maxChars=""
      canResize={false}
      onKind={noop}
      onTone={noop}
      onLength={noop}
      onMaxChars={noop}
      onResize={noop}
      {...over}
    />,
  );

describe("DraftControls", () => {
  it("lists every kind, tone and length", () => {
    const html = render();
    for (const text of [
      "Answers to questions",
      "Cover letter",
      "Recruiter message",
      "Cold email",
      "Relocation note",
      "Crisp",
      "Warm",
      "Bold",
      "Short",
      "Medium",
      "Long",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("shows the character limit box only for drafts", () => {
    expect(render({ kind: "answers" })).not.toContain("Character limit");
    expect(render({ kind: "message" })).toContain("Character limit");
  });

  it("shows Shorter and Longer only once there is a result, and disables the ends", () => {
    expect(render()).not.toContain("Shorter");
    const html = render({ canResize: true, length: "short" });
    expect(html).toContain("Longer");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Shorter/);
  });
});
