import "fake-indexeddb/auto";
import type { FitCheck } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { createFitStore, FIT_CACHE_LIMIT, fitKey } from "./fit-store.js";
import { openProfileDb } from "./profile-store.js";

let counter = 0;
const freshDb = () => openProfileDb(`slayply-fit-test-${++counter}`);

const FIT: FitCheck = {
  matches: [{ want: "Billing", have: "Built billing", factIds: ["F01"] }],
  gaps: ["Rust"],
  chance: "medium",
  reason: "Close.",
  resume: { track: "sde", region: "us" },
  dealBreakers: [],
};
const PROFILE = { facts: [{ id: "F01", text: "Built the billing system." }], stories: [] };

describe("fitKey", () => {
  it("is stable across surrounding whitespace and line endings", async () => {
    expect(await fitKey("Backend role\r\nGo")).toBe(await fitKey("  Backend role\nGo \n"));
  });

  it("differs for a different job description", async () => {
    expect(await fitKey("Backend role")).not.toBe(await fitKey("Frontend role"));
  });
});

describe("fit store (IndexedDB)", () => {
  it("returns null when nothing is cached for the job", async () => {
    expect(await createFitStore(freshDb()).get("missing")).toBeNull();
  });

  it("saves a result with the profile text it was checked against, and reads it back", async () => {
    const store = createFitStore(freshDb());
    const key = await fitKey("JD");
    await store.put(key, { fit: FIT, profile: PROFILE });
    const hit = await store.get(key);
    expect(hit?.fit).toEqual(FIT);
    expect(hit?.profile).toEqual(PROFILE);
  });

  it("replaces the result on a second put for the same job", async () => {
    const store = createFitStore(freshDb());
    await store.put("k", { fit: FIT, profile: PROFILE });
    await store.put("k", { fit: { ...FIT, chance: "high" }, profile: PROFILE });
    expect((await store.get("k"))?.fit.chance).toBe("high");
  });

  it("refuses to save a result that does not match the schema", async () => {
    const store = createFitStore(freshDb());
    await expect(
      store.put("k", { fit: { ...FIT, chance: "certain" } as never, profile: PROFILE }),
    ).rejects.toThrow(/not valid/);
    expect(await store.get("k")).toBeNull();
  });

  it("treats an unreadable cached record as a miss instead of failing", async () => {
    const db = freshDb();
    await (await db).put("fits", { key: "k", fit: "garbage" });
    expect(await createFitStore(db).get("k")).toBeNull();
  });

  it("keeps at most FIT_CACHE_LIMIT results, dropping the oldest", async () => {
    const store = createFitStore(freshDb());
    for (let i = 0; i < FIT_CACHE_LIMIT + 3; i++) {
      await store.put(`k${i}`, { fit: FIT, profile: PROFILE });
    }
    expect(await store.get("k0")).toBeNull();
    expect(await store.get("k2")).toBeNull();
    expect(await store.get(`k${FIT_CACHE_LIMIT + 2}`)).not.toBeNull();
    expect(await store.count()).toBe(FIT_CACHE_LIMIT);
  });
});
