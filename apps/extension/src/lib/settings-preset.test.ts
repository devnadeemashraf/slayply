import { describe, expect, it } from "vitest";
import { createSettingsStore, type StorageAreaLike } from "./settings.js";

function memoryArea(initial: Record<string, unknown> = {}): StorageAreaLike {
  const data = { ...initial };
  return {
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (items) => {
      Object.assign(data, items);
    },
    remove: async (key) => {
      delete data[key];
    },
  };
}

describe("settings preset", () => {
  it("defaults to neon", async () => {
    expect((await createSettingsStore(memoryArea()).load()).preset).toBe("neon");
  });

  it("saves a chosen preset and keeps the other settings", async () => {
    const store = createSettingsStore(memoryArea());
    await store.acknowledgePrivacy();
    await store.setPreset("bubblegum");
    const settings = await store.load();
    expect(settings.preset).toBe("bubblegum");
    expect(settings.privacyAcknowledged).toBe(true);
  });

  it("falls back to neon for an unknown stored value", async () => {
    const store = createSettingsStore(memoryArea({ "slayply:settings": { preset: "matrix" } }));
    expect((await store.load()).preset).toBe("neon");
  });

  it("falls back to neon for a non-string stored value", async () => {
    const store = createSettingsStore(memoryArea({ "slayply:settings": { preset: { a: 1 } } }));
    expect((await store.load()).preset).toBe("neon");
  });

  it("is reset by a wipe", async () => {
    const store = createSettingsStore(memoryArea());
    await store.setPreset("brutal");
    await store.wipe();
    expect((await store.load()).preset).toBe("neon");
  });
});
