import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { effectiveModel, ModelPicker, type ModelPickerProps } from "./model-picker.js";

const noop = () => {};
const models = [
  { id: "gpt-5.1", displayName: "GPT 5.1", supportsEffort: true },
  { id: "gpt-4o", displayName: "GPT-4o", supportsEffort: false },
];
const base: ModelPickerProps = {
  provider: "openai",
  models,
  loading: false,
  note: null,
  model: "",
  effort: "",
  disabled: false,
  onProvider: noop,
  onModel: noop,
  onEffort: noop,
};
const html = (props: Partial<ModelPickerProps> = {}) =>
  renderToString(<ModelPicker {...base} {...props} />);

describe("ModelPicker", () => {
  it("lists the three providers and the fetched models", () => {
    const out = html();
    expect(out).toContain("Claude (Anthropic)");
    expect(out).toContain("ChatGPT (OpenAI)");
    expect(out).toContain("Gemini (Google)");
    expect(out).toContain("GPT 5.1");
    expect(out).toContain("Newest available");
  });

  it("shows effort when the newest model supports it", () => {
    expect(html()).toContain('id="effort"');
  });

  it("shows effort for a model that supports it and hides it for one that does not", () => {
    expect(html({ model: "gpt-5.1" })).toContain('id="effort"');
    expect(html({ model: "gpt-4o" })).not.toContain('id="effort"');
  });

  it("hides effort when the list is missing, since support is unknown", () => {
    expect(html({ models: null })).not.toContain('id="effort"');
  });

  it("falls back to Newest when the saved model is not in the list", () => {
    expect(html({ model: "retired-model" })).not.toContain('value="retired-model"');
  });

  it("disables the model select while loading and shows a note", () => {
    const out = html({ loading: true, models: null, note: "Could not load the model list." });
    expect(out).toContain("Loading models");
    expect(out).toContain("Could not load the model list.");
  });

  it("finds the effective model", () => {
    expect(effectiveModel(models, "")?.id).toBe("gpt-5.1");
    expect(effectiveModel(models, "gpt-4o")?.id).toBe("gpt-4o");
    expect(effectiveModel(models, "nope")).toBeUndefined();
    expect(effectiveModel(null, "")).toBeUndefined();
  });
});
