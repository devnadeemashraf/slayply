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

describe("settings theme", () => {
  it("defaults to auto", async () => {
    expect((await createSettingsStore(memoryArea()).load()).theme).toBe("auto");
  });

  it("saves a chosen theme and keeps the other settings", async () => {
    const store = createSettingsStore(memoryArea());
    await store.acknowledgePrivacy();
    await store.setTheme("dark");
    const settings = await store.load();
    expect(settings.theme).toBe("dark");
    expect(settings.privacyAcknowledged).toBe(true);
  });

  it("falls back to auto for an unknown stored value", async () => {
    const store = createSettingsStore(memoryArea({ "slayply:settings": { theme: "matrix" } }));
    expect((await store.load()).theme).toBe("auto");
  });

  it("falls back to auto for a non-string stored value", async () => {
    const store = createSettingsStore(memoryArea({ "slayply:settings": { theme: { a: 1 } } }));
    expect((await store.load()).theme).toBe("auto");
  });

  it("is reset by a wipe", async () => {
    const store = createSettingsStore(memoryArea());
    await store.setTheme("light");
    await store.wipe();
    expect((await store.load()).theme).toBe("auto");
  });

  it("ignores a preset saved by an earlier version", async () => {
    const store = createSettingsStore(memoryArea({ "slayply:settings": { preset: "brutal" } }));
    const settings = await store.load();
    expect(settings.theme).toBe("auto");
    expect(settings).not.toHaveProperty("preset");
  });

  it("drops the old preset the next time settings are saved", async () => {
    const area = memoryArea({ "slayply:settings": { preset: "brutal" } });
    await createSettingsStore(area).setTheme("dark");
    expect((await area.get("slayply:settings"))["slayply:settings"]).not.toHaveProperty("preset");
  });
});
