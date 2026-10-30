export const PRESETS = ["neon", "bubblegum", "brutal"] as const;

export type Preset = (typeof PRESETS)[number];

export const DEFAULT_PRESET: Preset = "neon";

export function isPreset(value: unknown): value is Preset {
  return PRESETS.some((preset) => preset === value);
}
