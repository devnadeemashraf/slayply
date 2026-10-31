/** "auto" follows the system's light or dark setting. */
export const THEMES = ["auto", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "auto";

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

/** The toolbar toggle's order: match system, light, dark, and round again. */
export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? DEFAULT_THEME;
}
