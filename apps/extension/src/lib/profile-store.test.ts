import "fake-indexeddb/auto";
import { parseContextPack, reconcileProfile, type StoredProfile } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { createProfileStore, openProfileDb, ProfileCorruptError } from "./profile-store.js";

const NOW = "2026-10-29T00:00:00.000Z";
let counter = 0;
function uniqueName(): string {
  counter += 1;
  return `slayply-test-${counter}`;
}
const freshDb = () => openProfileDb(uniqueName());

function profileFrom(markdown: string): StoredProfile {
  const result = reconcileProfile(null, parseContextPack(markdown), NOW);
  if (!result.ok) throw new Error(result.message);
  return result.profile;
}

const PACK =
  "## Facts\n- Built a thing\n- Shipped a thing\n## Stories\n- A story\n## Rules\n- A rule";

describe("profile store (IndexedDB)", () => {
  it("returns null before anything is saved", async () => {
    expect(await createProfileStore(freshDb()).load()).toBeNull();
  });

  it("round-trips a profile, including rules and the ID counters", async () => {
    const store = createProfileStore(freshDb());
    const profile = profileFrom(PACK);
    await store.save(profile);
    expect(await store.load()).toEqual(profile);
  });

  it("keeps the counters across a reopen so deleted IDs are never reused", async () => {
    const name = uniqueName();
    await createProfileStore(openProfileDb(name)).save({ ...profileFrom(PACK), nextFact: 40 });
    const reopened = await createProfileStore(openProfileDb(name)).load();
    expect(reopened?.nextFact).toBe(40);
  });

  it("replaces the whole record on save", async () => {
    const store = createProfileStore(freshDb());
    const first = profileFrom(PACK);
    await store.save(first);
    const next = reconcileProfile(first, parseContextPack("## Facts\n- Only this"), NOW);
    if (!next.ok) throw new Error(next.message);
    await store.save(next.profile);
    const loaded = await store.load();
    expect(loaded?.facts).toHaveLength(1);
    expect(loaded?.stories).toEqual([]);
    expect(loaded?.rules).toEqual([]);
  });

  it("refuses to save an invalid profile and leaves the stored one alone", async () => {
    const store = createProfileStore(freshDb());
    const good = profileFrom(PACK);
    await store.save(good);
    const bad = { ...good, nextFact: 1 } as StoredProfile;
    await expect(store.save(bad)).rejects.toThrow(/not valid/i);
    expect(await store.load()).toEqual(good);
  });

  it("refuses a save from a stale window whose counters are behind, keeping the stored record", async () => {
    const name = uniqueName();
    const windowA = createProfileStore(openProfileDb(name));
    const windowB = createProfileStore(openProfileDb(name));
    const stale = profileFrom(PACK);
    await windowA.save(stale);
    await windowA.save({ ...stale, nextFact: stale.nextFact + 3 });
    await expect(windowB.save(stale)).rejects.toThrow(/another window/i);
    expect((await windowA.load())?.nextFact).toBe(stale.nextFact + 3);
  });

  it("discard() removes an unreadable record so the user can start over", async () => {
    const db = await freshDb();
    await db.put("profile", { garbage: true }, "current");
    const store = createProfileStore(Promise.resolve(db));
    await expect(store.load()).rejects.toBeInstanceOf(ProfileCorruptError);
    await store.discard();
    expect(await store.load()).toBeNull();
  });

  it("save() does not replace an unreadable record", async () => {
    const db = await freshDb();
    await db.put("profile", { garbage: true }, "current");
    const store = createProfileStore(Promise.resolve(db));
    await expect(store.save(profileFrom(PACK))).rejects.toBeInstanceOf(ProfileCorruptError);
    expect(await db.get("profile", "current")).toEqual({ garbage: true });
  });

  it("reports a corrupt record instead of loading it, and does not overwrite it", async () => {
    const name = uniqueName();
    const db = await openProfileDb(name);
    await db.put("profile", { schemaVersion: 1, facts: "garbage" }, "current");
    const store = createProfileStore(Promise.resolve(db));
    await expect(store.load()).rejects.toBeInstanceOf(ProfileCorruptError);
    expect(await db.get("profile", "current")).toEqual({ schemaVersion: 1, facts: "garbage" });
  });

  it("does not put profile text in its error messages", async () => {
    const db = await freshDb();
    await db.put("profile", { facts: [{ id: "F01", text: "secret salary 99L" }] }, "current");
    const error = await createProfileStore(Promise.resolve(db))
      .load()
      .catch((e: unknown) => e);
    expect((error as Error).message).not.toContain("secret salary");
  });
});
