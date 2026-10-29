import { describe, expect, it } from "vitest";
import {
  addProfileItem,
  type CompiledContext,
  editProfileItem,
  emptyStoredProfile,
  mergeCompiledContext,
  parseContextPack,
  parseStoredProfile,
  reconcileProfile,
  removeProfileItem,
  type StoredProfile,
  toProfile,
} from "./context-pack.js";
import { profileSchema } from "./schema.js";

const NOW = "2026-10-29T00:00:00.000Z";

function compiled(overrides: Partial<CompiledContext> = {}): CompiledContext {
  return {
    facts: [
      { key: "exp:1:role", text: "Role: Engineer at Acme, 2022-03 to present." },
      { key: "exp:1:ach:0", text: "At Acme: cut latency; 900ms to 200ms; users noticed." },
      { key: "exp:1:stack", text: "At Acme the stack was: TypeScript, Postgres." },
    ],
    stories: [{ key: "story:1", text: "The outage\nSituation: queue backed up." }],
    prefs: { "Writing tone": "crisp" },
    rules: ["Never claim a degree I do not have"],
    ...overrides,
  };
}

function merged(previous: StoredProfile | null, c: CompiledContext = compiled()) {
  const result = mergeCompiledContext(previous, c, NOW);
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("stored profile version 2", () => {
  it("upgrades a version 1 record: every item becomes manual and nothing is lost", () => {
    const v1 = {
      schemaVersion: 1,
      facts: [{ id: "F01", text: "Built billing" }],
      stories: [{ id: "S01", text: "The outage" }],
      prefs: { location: "remote" },
      rules: ["A rule"],
      nextFact: 2,
      nextStory: 2,
      updatedAt: NOW,
    };
    const parsed = parseStoredProfile(v1);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.schemaVersion).toBe(2);
    expect(parsed.data.facts).toEqual([{ id: "F01", text: "Built billing", origin: "manual" }]);
    expect(parsed.data.stories[0]?.origin).toBe("manual");
    expect(parsed.data.prefs).toEqual({ location: "remote" });
    expect(parsed.data.answerPrefs).toEqual({});
    expect(parsed.data.answerRules).toEqual([]);
  });

  it("still rejects a version 1 record with a bad item", () => {
    const bad = {
      schemaVersion: 1,
      facts: [{ id: "X1", text: "bad id" }],
      stories: [],
      prefs: {},
      rules: [],
      nextFact: 2,
      nextStory: 1,
      updatedAt: NOW,
    };
    expect(parseStoredProfile(bad).success).toBe(false);
  });

  it("rejects an unknown origin and an unknown extra field on an item", () => {
    const good = merged(null).profile;
    const withOrigin = { ...good, facts: [{ ...good.facts[0], origin: "robot" }] };
    const withExtra = { ...good, facts: [{ ...good.facts[0], secret: "x" }] };
    expect(parseStoredProfile(withOrigin).success).toBe(false);
    expect(parseStoredProfile(withExtra).success).toBe(false);
  });
});

describe("toProfile", () => {
  it("sends only id and text, so origin and key never reach the strict request", () => {
    const profile = toProfile(merged(null).profile);
    expect(profileSchema.safeParse(profile).success).toBe(true);
    for (const item of [...profile.facts, ...profile.stories]) {
      expect(Object.keys(item).sort()).toEqual(["id", "text"]);
    }
  });

  it("lets a questionnaire preference win over an imported one with the same key", () => {
    const base = reconcileProfile(
      null,
      parseContextPack("## Preferences\n- Writing tone: casual\n- location: remote"),
      NOW,
    );
    if (!base.ok) throw new Error(base.message);
    const both = merged(base.profile);
    expect(toProfile(both.profile).prefs).toEqual({ "Writing tone": "crisp", location: "remote" });
    expect(both.warnings.some((w) => /Writing tone/.test(w))).toBe(true);
  });

  it("does not send rules from either source", () => {
    const base = reconcileProfile(null, parseContextPack("## Rules\n- Imported rule"), NOW);
    if (!base.ok) throw new Error(base.message);
    const both = merged(base.profile);
    const sent = JSON.stringify(toProfile(both.profile));
    expect(sent).not.toContain("Imported rule");
    expect(sent).not.toContain("Never claim a degree");
  });
});

describe("mergeCompiledContext", () => {
  it("assigns IDs in order, tags them as answers and records their keys", () => {
    const { profile } = merged(null);
    expect(profile.facts.map((f) => f.id)).toEqual(["F01", "F02", "F03"]);
    expect(profile.facts.every((f) => f.origin === "answers")).toBe(true);
    expect(profile.facts[1]?.key).toBe("exp:1:ach:0");
    expect(profile.stories[0]).toMatchObject({ id: "S01", origin: "answers", key: "story:1" });
    expect(profile.answerRules).toEqual(["Never claim a degree I do not have"]);
    expect(profile.nextFact).toBe(4);
  });

  it("keeps an item's ID when its answer is edited (same key, new text)", () => {
    const first = merged(null).profile;
    const edited = compiled();
    edited.facts[1] = {
      key: "exp:1:ach:0",
      text: "At Acme: cut latency; 900ms to 150ms; users noticed.",
    };
    const second = merged(first, edited).profile;
    expect(second.facts[1]).toMatchObject({ id: "F02", text: expect.stringContaining("150ms") });
    expect(second.nextFact).toBe(first.nextFact);
  });

  it("follows the text, not the key, when two answers swap places", () => {
    const first = merged(null).profile;
    const swapped = compiled();
    const [a, b] = [swapped.facts[1], swapped.facts[2]];
    if (!a || !b) throw new Error("fixture");
    swapped.facts[1] = { key: "exp:1:ach:0", text: b.text };
    swapped.facts[2] = { key: "exp:1:stack", text: a.text };
    const second = merged(first, swapped).profile;
    // The sentence that was F02 is still F02 even though it now sits under another key.
    expect(second.facts.find((f) => f.text === a.text)?.id).toBe("F02");
    expect(second.facts.find((f) => f.text === b.text)?.id).toBe("F03");
  });

  it("retires an ID when its answer is cleared and never issues it again", () => {
    const first = merged(null).profile;
    const without = compiled({ facts: compiled().facts.filter((f) => f.key !== "exp:1:ach:0") });
    const second = merged(first, without).profile;
    expect(second.facts.map((f) => f.id)).toEqual(["F01", "F03"]);
    const third = merged(second, compiled()).profile;
    const restored = third.facts.find((f) => f.key === "exp:1:ach:0");
    expect(restored?.id).toBe("F04");
    expect(third.facts.map((f) => f.id)).not.toContain("F02");
  });

  it("keeps story IDs stable too: edit keeps, delete retires, re-add is new", () => {
    const first = merged(null).profile;
    const edited = compiled({
      stories: [{ key: "story:1", text: "The outage\nSituation: fixed." }],
    });
    const second = merged(first, edited).profile;
    expect(second.stories[0]).toMatchObject({ id: "S01", text: expect.stringContaining("fixed") });
    const gone = merged(second, compiled({ stories: [] })).profile;
    expect(gone.stories).toEqual([]);
    const back = merged(gone, compiled()).profile;
    expect(back.stories[0]?.id).toBe("S02");
  });

  it("known limit: achievements are keyed by position, so deleting one and editing the next moves the ID", () => {
    // Pinned on purpose (ADR-0008). Position is the identity of an achievement within a role.
    const first = merged(null).profile; // F02 = exp:1:ach:0
    const next = compiled();
    next.facts = [
      next.facts[0] as (typeof next.facts)[number],
      { key: "exp:1:ach:0", text: "At Acme: the second achievement, now edited." },
    ];
    const second = merged(first, next).profile;
    expect(second.facts.find((f) => f.key === "exp:1:ach:0")?.id).toBe("F02");
  });

  it("leaves manual items alone, in both directions", () => {
    let profile = merged(null).profile;
    const added = addProfileItem(profile, "fact", "A hand-written fact", NOW);
    if (!added.ok) throw new Error(added.message);
    profile = added.profile;
    const again = merged(profile, compiled({ facts: [] })).profile;
    expect(again.facts.map((f) => f.text)).toEqual(["A hand-written fact"]);
    expect(again.facts[0]?.origin).toBe("manual");
    expect(again.facts[0]?.id).toBe("F04");
  });

  it("does not store a sentence twice: duplicates inside the answers, or of a manual fact", () => {
    const base = reconcileProfile(
      null,
      parseContextPack("## Facts\n- Role: Engineer at Acme, 2022-03 to present."),
      NOW,
    );
    if (!base.ok) throw new Error(base.message);
    const dup = compiled({
      facts: [
        { key: "exp:1:role", text: "Role: Engineer at Acme, 2022-03 to present." },
        { key: "a", text: "Same sentence" },
        { key: "b", text: "  same   SENTENCE " },
      ],
    });
    const result = merged(base.profile, dup);
    expect(result.profile.facts.map((f) => f.text)).toEqual([
      "Same sentence",
      "Role: Engineer at Acme, 2022-03 to present.",
    ]);
    expect(result.warnings).toHaveLength(2);
  });

  it("replaces the previous questionnaire preferences and rules", () => {
    const first = merged(null).profile;
    const second = merged(first, compiled({ prefs: {}, rules: [] })).profile;
    expect(second.answerPrefs).toEqual({});
    expect(second.answerRules).toEqual([]);
  });

  it("refuses a merge that would break the request limits", () => {
    const prefs = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`k${i}`, "v"]));
    const base = reconcileProfile(
      null,
      { facts: ["x"], stories: [], prefs, rules: [], warnings: [] },
      NOW,
    );
    if (!base.ok) throw new Error(base.message);
    const result = mergeCompiledContext(base.profile, compiled({ prefs: { extra: "1" } }), NOW);
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/limits/i) });
  });
});

describe("manual import next to questionnaire items", () => {
  it("replaces only manual items and keeps questionnaire items and their IDs", () => {
    const answers = merged(null).profile;
    const result = reconcileProfile(answers, parseContextPack("## Facts\n- Imported fact"), NOW);
    if (!result.ok) throw new Error(result.message);
    expect(result.profile.facts.filter((f) => f.origin === "answers")).toHaveLength(3);
    expect(result.profile.facts.at(-1)).toMatchObject({ id: "F04", origin: "manual" });
    expect(result.profile.answerRules).toEqual(answers.answerRules);
  });

  it("skips an imported sentence the questionnaire already states", () => {
    const answers = merged(null).profile;
    const result = reconcileProfile(
      answers,
      parseContextPack("## Facts\n- role:  engineer at acme, 2022-03 to present.\n- Another"),
      NOW,
    );
    if (!result.ok) throw new Error(result.message);
    expect(result.profile.facts.map((f) => f.text)).not.toContain(
      "role: engineer at acme, 2022-03 to present.",
    );
    expect(result.profile.facts.filter((f) => f.origin === "manual")).toHaveLength(1);
  });

  it("re-importing the same pack keeps the manual IDs", () => {
    const pack = parseContextPack("## Facts\n- Imported fact\n- Second");
    const first = reconcileProfile(merged(null).profile, pack, NOW);
    if (!first.ok) throw new Error(first.message);
    const second = reconcileProfile(first.profile, pack, NOW);
    if (!second.ok) throw new Error(second.message);
    expect(second.profile.facts).toEqual(first.profile.facts);
  });
});

describe("editing items that come from answers", () => {
  const profile = () => merged(null).profile;

  it("rejects editing or removing them and points to the answer", () => {
    expect(editProfileItem(profile(), "F01", "new text", NOW)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/questionnaire/i),
    });
    expect(removeProfileItem(profile(), "S01", NOW)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/questionnaire/i),
    });
  });

  it("still edits manual items next to them", () => {
    const added = addProfileItem(profile(), "fact", "Manual one", NOW);
    if (!added.ok) throw new Error(added.message);
    const edited = editProfileItem(added.profile, "F04", "Manual two", NOW);
    expect(edited).toMatchObject({ ok: true });
  });
});

describe("empty profile", () => {
  it("is valid version 2", () => {
    expect(parseStoredProfile(emptyStoredProfile(NOW)).success).toBe(true);
  });
});
