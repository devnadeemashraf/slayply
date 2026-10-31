import { describe, expect, it } from "vitest";
import { chipLabel } from "./model-chip.js";

const MODELS = [
  { id: "gpt-5.1", displayName: "GPT-5.1", supportsEffort: true },
  { id: "gpt-4o", displayName: "GPT-4o", supportsEffort: false },
];

describe("chipLabel", () => {
  it("names the provider and the chosen model", () => {
    expect(
      chipLabel({ provider: "openai", model: "gpt-4o", effort: "", directMode: false }, MODELS),
    ).toBe("ChatGPT · GPT-4o");
  });

  it("falls back to the newest model when none is chosen or the list is unknown", () => {
    const settings = { provider: "openai", model: "", effort: "", directMode: false } as const;
    expect(chipLabel(settings, MODELS)).toBe("ChatGPT · GPT-5.1");
    expect(chipLabel(settings, null)).toBe("ChatGPT · newest");
  });

  it("shows the effort only when the model takes one", () => {
    const high = { provider: "openai", effort: "high", directMode: false } as const;
    expect(chipLabel({ ...high, model: "gpt-5.1" }, MODELS)).toBe("ChatGPT · GPT-5.1 · high");
    expect(chipLabel({ ...high, model: "gpt-4o" }, MODELS)).toBe("ChatGPT · GPT-4o");
  });

  it("shows Claude in Direct Mode whatever model is saved", () => {
    expect(
      chipLabel({ provider: "anthropic", model: "x", effort: "high", directMode: true }, MODELS),
    ).toBe("Claude · Direct");
  });

  it("says a non-Claude provider is blocked in Direct Mode", () => {
    expect(
      chipLabel({ provider: "gemini", model: "x", effort: "high", directMode: true }, MODELS),
    ).toBe("Gemini · blocked in Direct Mode");
  });

  it("uses text from our own table, never the model id as markup", () => {
    const label = chipLabel(
      { provider: "anthropic", model: "<b>x</b>", effort: "", directMode: false },
      null,
    );
    expect(label).toBe("Claude · newest");
  });
});
