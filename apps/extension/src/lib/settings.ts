const STORAGE_KEY = "slayply:settings";

// Mirrors the relay's check: printable ASCII only, so a key is always a valid header value.
const API_KEY_PATTERN = /^[!-~]{1,512}$/;

export type Settings = {
  anthropicKey: string;
  privacyAcknowledged: boolean;
};

export type SaveKeyResult = { ok: true } | { ok: false; reason: "empty" | "invalid" };

/** The subset of `chrome.storage.StorageArea` the store needs, so tests can pass an in-memory one. */
export type StorageAreaLike = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
};

const DEFAULTS: Settings = { anthropicKey: "", privacyAcknowledged: false };

function parseSettings(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULTS };
  const record = raw as Record<string, unknown>;
  return {
    anthropicKey: typeof record.anthropicKey === "string" ? record.anthropicKey : "",
    privacyAcknowledged: record.privacyAcknowledged === true,
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

    async saveKey(input: string): Promise<SaveKeyResult> {
      const key = input.trim();
      if (key === "") return { ok: false, reason: "empty" };
      if (!API_KEY_PATTERN.test(key)) return { ok: false, reason: "invalid" };
      await update({ anthropicKey: key });
      return { ok: true };
    },

    clearKey: () => update({ anthropicKey: "" }),

    acknowledgePrivacy: () => update({ privacyAcknowledged: true }),
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
