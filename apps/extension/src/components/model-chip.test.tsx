import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelChip } from "./model-chip.js";

const MODELS = [{ id: "gpt-5.1", displayName: "GPT-5.1", supportsEffort: true }];
const noop = () => {};

function render(props: Partial<Parameters<typeof ModelChip>[0]> = {}): string {
  return renderToString(
    <ModelChip
      settings={{ provider: "openai", model: "gpt-5.1", effort: "", directMode: false }}
      models={MODELS}
      loading={false}
      note={null}
      onChoice={noop}
      {...props}
    />,
  );
}

describe("ModelChip", () => {
  it("shows the current choice on a button that opens the picker", () => {
    const html = render();
    expect(html).toContain("ChatGPT · GPT-5.1");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/);
    expect(html).not.toContain('role="dialog"');
  });

  it("lists provider, model and effort when open", () => {
    const html = render({ initialOpen: true });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('id="provider"');
    expect(html).toContain('id="model"');
    expect(html).toContain('id="effort"');
  });

  it("locks model and effort in Direct Mode but leaves the provider choosable", () => {
    const html = render({
      initialOpen: true,
      settings: { provider: "anthropic", model: "", effort: "", directMode: true },
      note: "Direct Mode calls Claude",
    });
    expect(html).toContain("Claude · Direct");
    expect(html).toContain("Direct Mode calls Claude");
    expect(html).not.toMatch(/<select[^>]*id="provider"[^>]*disabled/);
    expect(html).toMatch(/<select[^>]*id="model"[^>]*disabled/);
  });

  it("does not claim Claude when a blocked provider is saved in Direct Mode", () => {
    const html = render({
      settings: { provider: "gemini", model: "", effort: "", directMode: true },
    });
    expect(html).toContain("Gemini · blocked in Direct Mode");
    expect(html).not.toContain("Claude");
  });
});
