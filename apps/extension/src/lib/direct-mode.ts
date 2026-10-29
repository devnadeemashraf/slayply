/** The only origin Direct Mode may call. Requested at toggle time, so the install asks for nothing. */
export const ANTHROPIC_ORIGIN_PATTERN = "https://api.anthropic.com/*";

export type DirectModeResult = { ok: true } | { ok: false; message: string };

export function createDirectModeController(deps: {
  save: (on: boolean) => Promise<void>;
  /** `chrome.permissions.request({ origins })`; must run from a click. */
  requestOrigins: (origins: string[]) => Promise<boolean>;
}) {
  return {
    async enable(): Promise<DirectModeResult> {
      let granted = false;
      try {
        granted = await deps.requestOrigins([ANTHROPIC_ORIGIN_PATTERN]);
      } catch {
        return { ok: false, message: "Direct Mode could not ask the browser for permission." };
      }
      if (!granted) {
        return { ok: false, message: "Direct Mode needs permission to reach api.anthropic.com." };
      }
      await deps.save(true);
      return { ok: true };
    },

    async disable(): Promise<DirectModeResult> {
      await deps.save(false);
      return { ok: true };
    },
  };
}
