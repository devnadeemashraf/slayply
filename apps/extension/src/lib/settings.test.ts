import { describe, expect, it } from "vitest";
import { createSettingsStore, keyFor, type StorageAreaLike } from "./settings.js";

const EMPTY_SETTINGS = {
  anthropicKey: "",
  openaiKey: "",
  geminiKey: "",
  provider: "anthropic",
  model: "",
  effort: "",
  privacyAcknowledged: false,
  directMode: false,
  theme: "auto",
} as const;

function memoryArea(initial: Record<string, unknown> = {}): StorageAreaLike & {
  data: Record<string, unknown>;
} {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

describe("settings store", () => {
  it("starts empty: no key, privacy not acknowledged", async () => {
    const store = createSettingsStore(memoryArea());
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "",
      privacyAcknowledged: false,
    });
  });

  it("stores Direct Mode and reads only a real true back", async () => {
    const area = memoryArea();
    const store = createSettingsStore(area);
    await store.setDirectMode(true);
    expect((await store.load()).directMode).toBe(true);
    await store.setDirectMode(false);
    expect((await store.load()).directMode).toBe(false);
    area.data["slayply:settings"] = { directMode: "yes" };
    expect((await store.load()).directMode).toBe(false);
  });

  it("saves a trimmed key and reads it back", async () => {
    const store = createSettingsStore(memoryArea());
    expect(await store.saveKey("  sk-ant-abc123  ")).toEqual({ ok: true });
    expect((await store.load()).anthropicKey).toBe("sk-ant-abc123");
  });

  it("wipes the key and the acknowledgement, removing the stored record", async () => {
    const area = memoryArea();
    const store = createSettingsStore(area);
    await store.acknowledgePrivacy();
    await store.saveKey("sk-ant-abc123");
    await store.wipe();
    expect(area.data).toEqual({});
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "",
      privacyAcknowledged: false,
    });
  });

  it("clears the key without touching the acknowledgement", async () => {
    const store = createSettingsStore(memoryArea());
    await store.acknowledgePrivacy();
    await store.saveKey("sk-ant-abc123");
    await store.clearKey();
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "",
      privacyAcknowledged: true,
    });
  });

  it("records the privacy acknowledgement", async () => {
    const store = createSettingsStore(memoryArea());
    await store.acknowledgePrivacy();
    expect((await store.load()).privacyAcknowledged).toBe(true);
  });

  it("rejects an empty or whitespace-only key and stores nothing", async () => {
    const area = memoryArea();
    const store = createSettingsStore(area);
    expect(await store.saveKey("   ")).toEqual({ ok: false, reason: "empty" });
    expect(area.data).toEqual({});
  });

  it("rejects keys the relay would refuse: inner spaces, non-ASCII, over 512 characters", async () => {
    const store = createSettingsStore(memoryArea());
    expect(await store.saveKey("sk ant")).toEqual({ ok: false, reason: "invalid" });
    expect(await store.saveKey("sk-ant-é")).toEqual({ ok: false, reason: "invalid" });
    expect(await store.saveKey("a".repeat(513))).toEqual({ ok: false, reason: "invalid" });
    expect(await store.saveKey("a".repeat(512))).toEqual({ ok: true });
  });

  it("rejects a header-injection attempt in the key", async () => {
    const store = createSettingsStore(memoryArea());
    expect(await store.saveKey("sk-ant-x\r\nX-Evil: 1")).toEqual({ ok: false, reason: "invalid" });
  });

  it("falls back to defaults when stored fields have the wrong types", async () => {
    const store = createSettingsStore(
      memoryArea({ "slayply:settings": { anthropicKey: 42, privacyAcknowledged: "yes" } }),
    );
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "",
      privacyAcknowledged: false,
    });
  });

  it("falls back to defaults when stored data is not an object", async () => {
    const store = createSettingsStore(memoryArea({ "slayply:settings": "garbage" }));
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "",
      privacyAcknowledged: false,
    });
  });

  it("keeps both fields when two updates overlap", async () => {
    const area = memoryArea();
    const slowGet = area.get.bind(area);
    area.get = async (key) => {
      const result = await slowGet(key);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return result;
    };
    const store = createSettingsStore(area);
    await Promise.all([store.saveKey("sk-ant-abc123"), store.acknowledgePrivacy()]);
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "sk-ant-abc123",
      privacyAcknowledged: true,
    });
  });

  it("keeps working after a failed write", async () => {
    const area = memoryArea();
    let fail = true;
    const set = area.set.bind(area);
    area.set = async (items) => {
      if (fail) throw new Error("quota");
      await set(items);
    };
    const store = createSettingsStore(area);
    await expect(store.acknowledgePrivacy()).rejects.toThrow();
    fail = false;
    await store.acknowledgePrivacy();
    expect((await store.load()).privacyAcknowledged).toBe(true);
  });

  it("does not leak the key through an error from the storage layer", async () => {
    const failing: StorageAreaLike = {
      async get() {
        return {};
      },
      async set() {
        throw new Error("QUOTA_BYTES quota exceeded");
      },
      async remove() {},
    };
    const store = createSettingsStore(failing);
    const error = await store.saveKey("sk-ant-secret").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/could not be saved/);
    expect((error as Error).message).not.toContain("sk-ant-secret");
  });

  it("reads a record saved before the picker existed with the new fields at their defaults", async () => {
    const store = createSettingsStore(
      memoryArea({
        "slayply:settings": {
          anthropicKey: "sk-ant-1",
          privacyAcknowledged: true,
          directMode: true,
        },
      }),
    );
    expect(await store.load()).toEqual({
      ...EMPTY_SETTINGS,
      anthropicKey: "sk-ant-1",
      privacyAcknowledged: true,
      directMode: true,
    });
  });

  it("keeps a separate key per provider and reads each back", async () => {
    const store = createSettingsStore(memoryArea());
    await store.saveKey("sk-ant-1");
    await store.saveKey("sk-oai-2", "openai");
    await store.saveKey("AIza-3", "gemini");
    const settings = await store.load();
    expect(keyFor(settings, "anthropic")).toBe("sk-ant-1");
    expect(keyFor(settings, "openai")).toBe("sk-oai-2");
    expect(keyFor(settings, "gemini")).toBe("AIza-3");
    await store.clearKey("openai");
    expect(keyFor(await store.load(), "openai")).toBe("");
    expect(keyFor(await store.load(), "anthropic")).toBe("sk-ant-1");
  });

  it("validates a key for every provider", async () => {
    const store = createSettingsStore(memoryArea());
    expect(await store.saveKey("bad key", "gemini")).toEqual({ ok: false, reason: "invalid" });
    expect(await store.saveKey(" ", "openai")).toEqual({ ok: false, reason: "empty" });
  });

  it("stores the provider, model and effort choice", async () => {
    const store = createSettingsStore(memoryArea());
    await store.setChoice({ provider: "openai", model: "gpt-5.1", effort: "high" });
    expect(await store.load()).toMatchObject({
      provider: "openai",
      model: "gpt-5.1",
      effort: "high",
    });
  });

  it("drops a model id that is not a plain id", async () => {
    const store = createSettingsStore(memoryArea());
    await store.setChoice({ provider: "gemini", model: "../x?y", effort: "" });
    expect((await store.load()).model).toBe("");
  });

  it("falls back for a hand-edited provider, model and effort", async () => {
    const store = createSettingsStore(
      memoryArea({
        "slayply:settings": { provider: "mistral", model: "a b", effort: "max", openaiKey: 7 },
      }),
    );
    expect(await store.load()).toEqual(EMPTY_SETTINGS);
  });
});
