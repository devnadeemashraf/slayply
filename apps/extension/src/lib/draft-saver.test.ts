import "fake-indexeddb/auto";
import { type ContextAnswers, emptyAnswers } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { createAnswersStore } from "./answers-store.js";
import { createDraftSaver } from "./draft-saver.js";
import { createProfileStore, openProfileDb } from "./profile-store.js";
import { addEntry, setAnswer } from "./questionnaire-state.js";

const NOW = "2026-10-29T00:00:00.000Z";
let counter = 0;
function setup() {
  counter += 1;
  const db = openProfileDb(`slayply-saver-test-${counter}`);
  const store = createAnswersStore(db);
  const saver = createDraftSaver(store, () => NOW);
  saver.init(emptyAnswers());
  return { db, store, saver };
}

const named = (name: string): ContextAnswers =>
  setAnswer(emptyAnswers(), ["profile", "name"], name);

describe("draft saver", () => {
  it("saves a change, skips an unchanged copy, then saves the next change", async () => {
    const { store, saver } = setup();
    expect(await saver.save(emptyAnswers())).toEqual({ status: "unchanged" });
    expect(await saver.save(named("Asha"))).toEqual({ status: "saved" });
    expect(await saver.save(named("Asha"))).toEqual({ status: "unchanged" });
    expect(await saver.save(named("Asha Rao"))).toEqual({ status: "saved" });
    expect((await store.load())?.profile.name).toBe("Asha Rao");
    expect(saver.revision).toBe(2);
  });

  it("saves everything else when one field is invalid, and says which one was left out", async () => {
    const { store, saver } = setup();
    let a = setAnswer(addEntry(emptyAnswers(), "experience"), ["experience", 0, "end"], "20");
    a = setAnswer(a, ["profile", "name"], "Asha");
    const outcome = await saver.save(a);
    expect(outcome).toEqual({ status: "partial", dropped: ["experience.0.end"] });
    const stored = await store.load();
    expect(stored?.profile.name).toBe("Asha");
    expect(stored?.experience[0]).not.toHaveProperty("end");
  });

  it("keeps saving later edits while the bad field is still there", async () => {
    const { store, saver } = setup();
    const bad = setAnswer(emptyAnswers(), ["targets", "roles"], ["x".repeat(81)]);
    expect((await saver.save(bad)).status).toBe("partial");
    // Ten minutes later, in another section:
    const more = setAnswer(bad, ["profile", "headline"], "Engineer");
    expect((await saver.save(more)).status).toBe("partial");
    const stored = await store.load();
    expect(stored?.profile.headline).toBe("Engineer");
    expect(stored?.targets).not.toHaveProperty("roles");
    // Once fixed, the field is stored.
    const fixed = setAnswer(more, ["targets", "roles"], ["FDE"]);
    expect((await saver.save(fixed)).status).toBe("saved");
    expect((await store.load())?.targets.roles).toEqual(["FDE"]);
  });

  it("does not write again for text that only differs by trailing spaces", async () => {
    const { saver } = setup();
    expect((await saver.save(named("Asha  "))).status).toBe("saved");
    expect((await saver.save(named("Asha  "))).status).toBe("unchanged");
    expect(saver.revision).toBe(1);
  });

  it("runs overlapping saves one after the other without a stale error", async () => {
    const { store, saver } = setup();
    const results = await Promise.all([
      saver.save(named("A")),
      saver.save(named("AB")),
      saver.save(named("ABC")),
    ]);
    expect(results.map((r) => r.status)).toEqual(["saved", "saved", "saved"]);
    expect((await store.load())?.profile.name).toBe("ABC");
  });

  it("reports a stale window instead of overwriting", async () => {
    const { db, saver } = setup();
    await saver.save(named("First"));
    await createAnswersStore(db).saveDraft({ ...named("Other window"), revision: saver.revision });
    const outcome = await saver.save(named("Late"));
    expect(outcome).toMatchObject({
      status: "stale",
      message: expect.stringMatching(/another window/i),
    });
    expect((await createAnswersStore(db).load())?.profile.name).toBe("Other window");
  });

  it("applies answers: saves them and builds the profile with warnings", async () => {
    const { db, saver } = setup();
    let a = addEntry(emptyAnswers(), "experience");
    a = setAnswer(a, ["experience", 0, "company"], "Acme");
    a = setAnswer(a, ["profile", "name"], "Asha");
    const outcome = await saver.apply(a);
    expect(outcome.status).toBe("applied");
    if (outcome.status !== "applied") return;
    expect(outcome.profile.facts.map((f) => f.text)).toEqual(["Name: Asha."]);
    expect(outcome.warnings.some((w) => /Skipped Experience #1/.test(w))).toBe(true);
    expect((await createProfileStore(db).load())?.facts).toHaveLength(1);
    // The saved revision carries on, so the next autosave is not stale.
    expect(await saver.save(setAnswer(a, ["profile", "headline"], "Eng"))).toEqual({
      status: "saved",
    });
  });

  it("does not apply invalid answers", async () => {
    const { db, saver } = setup();
    const bad = setAnswer(emptyAnswers(), ["profile", "name"], "x".repeat(200));
    expect((await saver.apply(bad)).status).toBe("invalid");
    expect(await createProfileStore(db).load()).toBeNull();
  });
});
