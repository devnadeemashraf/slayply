import type { Effort } from "@slayply/core";
import type { ProviderId } from "@slayply/providers";

const STORAGE_KEY = "slayply:settings";

// Mirrors the relay's check: printable ASCII only, so a key is always a valid header value.
const API_KEY_PATTERN = /^[!-~]{1,512}$/;

export type Settings = {
  anthropicKey: string;
  openaiKey: string;
  geminiKey: string;
  /** Provider the next generation uses. */
  provider: ProviderId;
  /** Model id, or "" for the provider's newest model. */
  model: string;
  /** Reasoning effort, or "" for the provider's default. */
  effort: Effort | "";
  privacyAcknowledged: boolean;
  /** Direct Mode: call the provider from the panel and skip the relay (SPEC Feature 8). */
  directMode: boolean;
};

export type SaveKeyResult = { ok: true } | { ok: false; reason: "empty" | "invalid" };

/** The subset of `chrome.storage.StorageArea` the store needs, so tests can pass an in-memory one. */
export type StorageAreaLike = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

const DEFAULTS: Settings = {
  anthropicKey: "",
  openaiKey: "",
  geminiKey: "",
  provider: "anthropic",
  model: "",
  effort: "",
  privacyAcknowledged: false,
  directMode: false,
};

const KEY_FIELDS = {
  anthropic: "anthropicKey",
  openai: "openaiKey",
  gemini: "geminiKey",
} as const satisfies Record<ProviderId, keyof Settings>;

const MODEL_PATTERN = /^[\w.:-]{1,64}$/;

export function keyFor(settings: Settings, provider: ProviderId): string {
  return settings[KEY_FIELDS[provider]];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULTS };
  const record = raw as Record<string, unknown>;
  return {
    anthropicKey: text(record.anthropicKey),
    openaiKey: text(record.openaiKey),
    geminiKey: text(record.geminiKey),
    provider:
      record.provider === "openai" || record.provider === "gemini" ? record.provider : "anthropic",
    model: typeof record.model === "string" && MODEL_PATTERN.test(record.model) ? record.model : "",
    effort:
      record.effort === "low" || record.effort === "medium" || record.effort === "high"
        ? record.effort
        : "",
    privacyAcknowledged: record.privacyAcknowledged === true,
    directMode: record.directMode === true,
  };
}

export function createSettingsStore(area: StorageAreaLike) {
  async function load(): Promise<Settings> {
    const stored = await area.get(STORAGE_KEY);
    return parseSettings(stored[STORAGE_KEY]);
  }

  async function write(next: Settings): Promise<void> {
    try {
      await area.set({ [STORAGE_KEY]: next });
    } catch {
      // The storage error can carry request details; ours never names the value.
      throw new Error("Settings could not be saved to browser storage");
    }
  }

  // Updates read-modify-write the whole object, so they run one at a time or overlapping calls lose fields.
  let queue: Promise<unknown> = Promise.resolve();
  function update(patch: Partial<Settings>): Promise<void> {
    const run = queue.then(async () => write({ ...(await load()), ...patch }));
    queue = run.catch(() => undefined);
    return run;
  }

  return {
    load,

    async saveKey(input: string, provider: ProviderId = "anthropic"): Promise<SaveKeyResult> {
      const key = input.trim();
      if (key === "") return { ok: false, reason: "empty" };
      if (!API_KEY_PATTERN.test(key)) return { ok: false, reason: "invalid" };
      await update({ [KEY_FIELDS[provider]]: key });
      return { ok: true };
    },

    clearKey: (provider: ProviderId = "anthropic") => update({ [KEY_FIELDS[provider]]: "" }),

    /** Switching provider resets the model and effort, which belong to one provider's list. */
    async setChoice(choice: Pick<Settings, "provider" | "model" | "effort">): Promise<void> {
      const { model } = choice;
      await update({ ...choice, model: MODEL_PATTERN.test(model) ? model : "" });
    },

    acknowledgePrivacy: () => update({ privacyAcknowledged: true }),

    setDirectMode: (on: boolean) => update({ directMode: on }),

    /** Removes the whole record (key and acknowledgement), queued behind any update in flight. */
    wipe(): Promise<void> {
      const run = queue.then(() => area.remove(STORAGE_KEY));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
