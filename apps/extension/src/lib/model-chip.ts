import type { ProviderId } from "@slayply/providers";
import { effectiveModel } from "../components/model-picker.js";
import type { ModelChoice } from "./models-client.js";
import type { Settings } from "./settings.js";

export type ChipSettings = Pick<Settings, "provider" | "model" | "effort" | "directMode">;

const SHORT_NAMES: Record<ProviderId, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

/** The text on the app bar chip. Direct Mode uses Claude's newest model whatever model is saved. */
export function chipLabel(settings: ChipSettings, models: readonly ModelChoice[] | null): string {
  if (settings.directMode) {
    // Direct Mode serves Claude only; a saved provider that is not Claude is blocked, so say so.
    return settings.provider === "anthropic"
      ? `${SHORT_NAMES.anthropic} · Direct`
      : `${SHORT_NAMES[settings.provider]} · blocked in Direct Mode`;
  }
  const found = effectiveModel(models, settings.model);
  const parts = [SHORT_NAMES[settings.provider], found?.displayName ?? "newest"];
  if (found?.supportsEffort && settings.effort !== "") parts.push(settings.effort);
  return parts.join(" · ");
}
