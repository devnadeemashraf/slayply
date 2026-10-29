import "fake-indexeddb/auto";
import {
  addProfileItem,
  type ContextAnswers,
  compileAnswers,
  emptyAnswers,
  publicAnswers,
  removeProfileItem,
  type StoredProfile,
} from "@slayply/core";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { AnswersCorruptError, createAnswersStore, StaleAnswersError } from "./answers-store.js";
import {
  createProfileStore,
  openProfileDb,
  ProfileCorruptError,
  StaleProfileError,
} from "./profile-store.js";

const NOW = "2026-10-29T00:00:00.000Z";
let counter = 0;
function uniqueName(): string {
  counter += 1;
  return `slayply-answers-test-${counter}`;
}

function answersWith(change: (a: ContextAnswers) => void): ContextAnswers {
  const a = emptyAnswers();
  change(a);
  return a;
}

const withName = (name: string) =>
  answersWith((a) => {
    a.profile = { name, headline: "Engineer" };
  });

describe("database upgrade from version 1", () => {
  it("keeps the saved profile and adds the answers and resumes stores", async () => {
    const name = uniqueName();
    // Build a version 1 database exactly as the previous release did.
    const v1 = await openDB(name, 1, { upgrade: (db) => void db.createObjectStore("profile") });
    const oldRecord = {
      schemaVersion: 1,
      facts: [{ id: "F01", text: "Built billing" }],
      stories: [],
      prefs: { location: "remote" },
      rules: ["A rule"],
      nextFact: 2,
      nextStory: 1,
      updatedAt: NOW,
    };
    await v1.put("profile", oldRecord, "current");
    v1.close();

    const db = openProfileDb(name);
    expect([...(await db).objectStoreNames].sort()).toEqual(["answers", "profile", "resumes"]);
    const loaded = await createProfileStore(db).load();
    expect(loaded).toMatchObject({
      schemaVersion: 2,
      facts: [{ id: "F01", text: "Built billing", origin: "manual" }],
      prefs: { location: "remote" },
      rules: ["A rule"],
      nextFact: 2,
    });
    expect(await createAnswersStore(db).load()).toBeNull();
  });

  it("still blocks a stale profile after the upgrade", async () => {
    const name = uniqueName();
    const v1 = await openDB(name, 1, { upgrade: (db) => void db.createObjectStore("profile") });
    await v1.put(
      "profile",
      {
        schemaVersion: 1,
        facts: [{ id: "F05", text: "x" }],
        stories: [],
        prefs: {},
        rules: [],
        nextFact: 6,
        nextStory: 1,
        updatedAt: NOW,
      },
      "current",
    );
    v1.close();
    const db = openProfileDb(name);
    const loaded = await createProfileStore(db).load();
    // Valid on its own (no F05 in it), but its counter is behind the stored one.
    const stale = { ...loaded, facts: [], nextFact: 2 } as StoredProfile;
    await expect(createProfileStore(db).save(stale)).rejects.toBeInstanceOf(StaleProfileError);
  });
});

describe("answers store", () => {
  it("returns null before anything is saved", async () => {
    expect(await createAnswersStore(openProfileDb(uniqueName())).load()).toBeNull();
  });

  it("saves a draft, bumps the revision and round-trips it", async () => {
    const store = createAnswersStore(openProfileDb(uniqueName()));
    const saved = await store.saveDraft(withName("Asha"));
    expect(saved.revision).toBe(1);
    expect(await store.load()).toEqual(saved);
    const again = await store.saveDraft({ ...saved, profile: { name: "Asha Rao" } });
    expect(again.revision).toBe(2);
  });

  it("refuses a save from a window that is behind", async () => {
    const store = createAnswersStore(openProfileDb(uniqueName()));
    const first = await store.saveDraft(withName("Asha"));
    await store.saveDraft({ ...first, profile: { name: "Other window" } });
    await expect(store.saveDraft({ ...first, profile: { name: "Late" } })).rejects.toBeInstanceOf(
      StaleAnswersError,
    );
    expect((await store.load())?.profile.name).toBe("Other window");
  });

  it("refuses to create a record when the caller thinks one exists", async () => {
    const store = createAnswersStore(openProfileDb(uniqueName()));
    await expect(store.saveDraft({ ...withName("A"), revision: 3 })).rejects.toBeInstanceOf(
      StaleAnswersError,
    );
  });

  it("refuses invalid answers and leaves the stored ones alone", async () => {
    const store = createAnswersStore(openProfileDb(uniqueName()));
    const saved = await store.saveDraft(withName("Asha"));
    const bad = { ...saved, profile: { name: "x".repeat(101) } };
    await expect(store.saveDraft(bad)).rejects.toThrow(/not valid/i);
    expect(await store.load()).toEqual(saved);
  });

  it("stops on an unreadable record, never overwrites it, and can discard it", async () => {
    const name = uniqueName();
    const raw = await openDB(name, 2, {
      upgrade(db, old) {
        if (old < 1) db.createObjectStore("profile");
        if (old < 2) db.createObjectStore("answers");
      },
    });
    await raw.put("answers", { schemaVersion: 1, junk: true }, "current");
    raw.close();
    const store = createAnswersStore(openProfileDb(name));
    await expect(store.load()).rejects.toBeInstanceOf(AnswersCorruptError);
    await expect(store.saveDraft(withName("A"))).rejects.toBeInstanceOf(AnswersCorruptError);
    await store.discard();
    expect(await store.load()).toBeNull();
  });
});

const compiledOf = (a: ContextAnswers) => compileAnswers(publicAnswers(a));

const oneRole = () =>
  answersWith((a) => {
    a.nextEntry = 2;
    a.experience = [{ entryId: 1, company: "Acme", title: "Engineer", start: "2022-03" }];
  });

describe("saving answers together with the compiled profile", () => {
  it("writes both, or neither", async () => {
    const db = openProfileDb(uniqueName());
    const store = createAnswersStore(db);
    const answers = oneRole();
    const saved = await store.saveWithCompiled(answers, compiledOf(answers), NOW);
    expect(saved.answers.revision).toBe(1);
    expect((await createProfileStore(db).load())?.facts[0]?.text).toMatch(/Engineer at Acme/);

    // A stale copy is refused and the profile is not touched either.
    const behind = { ...answers, profile: { name: "Late" } };
    await expect(store.saveWithCompiled(behind, compiledOf(behind), NOW)).rejects.toBeInstanceOf(
      StaleAnswersError,
    );
    expect((await createProfileStore(db).load())?.facts).toHaveLength(1);
  });

  it("does not save answers when the profile record is unreadable", async () => {
    const name = uniqueName();
    const raw = await openDB(name, 2, {
      upgrade(db, old) {
        if (old < 1) db.createObjectStore("profile");
        if (old < 2) db.createObjectStore("answers");
      },
    });
    await raw.put("profile", { junk: true }, "current");
    raw.close();
    const store = createAnswersStore(openProfileDb(name));
    const answers = oneRole();
    await expect(store.saveWithCompiled(answers, compiledOf(answers), NOW)).rejects.toBeInstanceOf(
      ProfileCorruptError,
    );
    expect(await store.load()).toBeNull();
  });

  it("keeps the fact ID when an answer is edited and saved again", async () => {
    const db = openProfileDb(uniqueName());
    const store = createAnswersStore(db);
    const first = answersWith((a) => {
      a.nextEntry = 2;
      a.skills = [{ entryId: 1, name: "Rust" }];
    });
    const saved = await store.saveWithCompiled(first, compiledOf(first), NOW);
    const edited = { ...saved.answers, skills: [{ entryId: 1, name: "Rust", years: 3 }] };
    const after = (await store.saveWithCompiled(edited, compiledOf(edited), NOW)).profile;
    expect(after.facts).toHaveLength(1);
    expect(after.facts[0]?.id).toBe("F01");
    expect(after.facts[0]?.text).toContain("3 years");
  });

  it("does not undo a removal or edit made in another window (re-merges against the stored profile)", async () => {
    const db = openProfileDb(uniqueName());
    const store = createAnswersStore(db);
    const profiles = createProfileStore(db);
    const first = oneRole();
    const saved = await store.saveWithCompiled(first, compiledOf(first), NOW);
    // Window B adds two manual facts; window A (still holding its old copy) removes one.
    let current = saved.profile;
    for (const text of ["Manual one", "Manual two"]) {
      const added = addProfileItem(current, "fact", text, NOW);
      if (!added.ok) throw new Error(added.message);
      current = added.profile;
    }
    await profiles.save(current);
    const removed = removeProfileItem(current, "F03", NOW);
    if (!removed.ok) throw new Error(removed.message);
    await profiles.save(removed.profile);
    // Window B now saves an answers edit based on the older profile it loaded.
    const edited = { ...saved.answers, profile: { name: "Asha" } };
    const result = await store.saveWithCompiled(edited, compiledOf(edited), NOW);
    expect(result.profile.facts.map((f) => f.text)).not.toContain("Manual two");
    expect(result.profile.facts.map((f) => f.text)).toContain("Manual one");
  });

  it("discarding answers also removes the items built from them, and keeps manual ones", async () => {
    const db = openProfileDb(uniqueName());
    const store = createAnswersStore(db);
    const answers = oneRole();
    const saved = await store.saveWithCompiled(answers, compiledOf(answers), NOW);
    const added = addProfileItem(saved.profile, "fact", "Typed by hand", NOW);
    if (!added.ok) throw new Error(added.message);
    await createProfileStore(db).save(added.profile);
    await store.discard();
    expect(await store.load()).toBeNull();
    const profile = await createProfileStore(db).load();
    expect(profile?.facts.map((f) => f.text)).toEqual(["Typed by hand"]);
    expect(profile?.answerRules).toEqual([]);
    // Retired IDs stay retired.
    expect(profile?.nextFact).toBeGreaterThan(2);
  });
});
