import { type ContextAnswers, emptyAnswers } from "@slayply/core";
import { describe, expect, it } from "vitest";
import {
  addEntry,
  addGroupItem,
  exportAnswersJson,
  getAt,
  moveEntry,
  parseAnswersImport,
  removeEntry,
  removeGroupItem,
  sanitizeAnswers,
  sectionProgress,
  setAnswer,
  setAt,
  validateAnswers,
} from "./questionnaire-state.js";

const withRoles = (): ContextAnswers => {
  let a = emptyAnswers();
  a = addEntry(a, "experience");
  a = addEntry(a, "experience");
  a = setAnswer(a, ["experience", 0, "company"], "Acme");
  a = setAnswer(a, ["experience", 1, "company"], "Beta");
  return a;
};

describe("setAnswer / getAt", () => {
  it("sets a nested value without mutating the original", () => {
    const a = emptyAnswers();
    const b = setAnswer(a, ["profile", "name"], "Asha");
    expect(getAt(b, ["profile", "name"])).toBe("Asha");
    expect(a.profile.name).toBeUndefined();
  });

  it("treats empty text, NaN and an empty list as not answered", () => {
    let a = setAnswer(emptyAnswers(), ["profile", "name"], "Asha");
    a = setAnswer(a, ["profile", "name"], "");
    expect(a.profile).not.toHaveProperty("name");
    expect(setAnswer(a, ["targets", "salaryMin"], Number.NaN).targets).not.toHaveProperty(
      "salaryMin",
    );
    expect(setAnswer(a, ["targets", "roles"], []).targets).not.toHaveProperty("roles");
  });

  it("writes into an array element", () => {
    expect(getAt(withRoles(), ["experience", 1, "company"])).toBe("Beta");
  });
});

describe("repeatable entries", () => {
  it("gives each new entry a fresh ID and never reuses one after a removal", () => {
    let a = withRoles();
    expect(a.experience.map((e) => e.entryId)).toEqual([1, 2]);
    a = removeEntry(a, "experience", 1);
    a = addEntry(a, "experience");
    expect(a.experience.map((e) => e.entryId)).toEqual([1, 3]);
    expect(a.nextEntry).toBe(4);
  });

  it("stops at the section limit", () => {
    let a = emptyAnswers();
    for (let i = 0; i < 12; i += 1) a = addEntry(a, "education");
    expect(a.education).toHaveLength(4);
    expect(a.nextEntry).toBe(5);
  });

  it("moves an entry up or down and keeps its ID", () => {
    const a = moveEntry(withRoles(), "experience", 0, 1);
    expect(a.experience.map((e) => e.company)).toEqual(["Beta", "Acme"]);
    expect(a.experience.map((e) => e.entryId)).toEqual([2, 1]);
  });

  it("ignores a move past either end and an unknown index", () => {
    const a = withRoles();
    expect(moveEntry(a, "experience", 0, -1)).toBe(a);
    expect(moveEntry(a, "experience", 1, 1)).toBe(a);
    expect(removeEntry(a, "experience", 9)).toBe(a);
  });

  it("ignores add on a section that is not repeatable", () => {
    const a = emptyAnswers();
    expect(addEntry(a, "profile")).toBe(a);
  });
});

describe("nested achievements", () => {
  it("adds up to the limit and removes one", () => {
    const path = ["experience", 0, "achievements"] as const;
    let a = withRoles();
    for (let i = 0; i < 5; i += 1) a = addGroupItem(a, path, 3);
    expect(getAt(a, path)).toHaveLength(3);
    a = setAnswer(a, [...path, 1, "action"], "Did it");
    a = removeGroupItem(a, path, 0);
    expect(getAt(a, [...path, 0, "action"])).toBe("Did it");
    a = removeGroupItem(removeGroupItem(a, path, 0), path, 0);
    expect(getAt(a, path)).toBeUndefined();
  });
});

describe("validateAnswers", () => {
  it("is empty for a valid draft, even a mostly blank one", () => {
    expect(validateAnswers(withRoles())).toEqual({});
  });

  it("reports a bad month at the field's path", () => {
    const a = setAnswer(withRoles(), ["experience", 0, "end"], "2024-1");
    const errors = validateAnswers(a);
    expect(Object.keys(errors)).toEqual(["experience.0.end"]);
    expect(errors["experience.0.end"]).toMatch(/YYYY-MM/);
  });

  it("reports text that is too long", () => {
    const a = setAnswer(emptyAnswers(), ["profile", "name"], "x".repeat(101));
    expect(validateAnswers(a)["profile.name"]).toMatch(/too long/i);
  });
});

describe("sectionProgress", () => {
  it("marks only sections with an answer and counts entries", () => {
    let a = withRoles();
    a = setAnswer(a, ["voice", "tone"], "warm");
    const rows = Object.fromEntries(sectionProgress(a).map((r) => [r.id, r]));
    expect(rows.experience).toMatchObject({ filled: true, entries: 2 });
    expect(rows.voice?.filled).toBe(true);
    expect(rows.profile?.filled).toBe(false);
    expect(rows.skills).toMatchObject({ filled: false, entries: 0 });
  });

  it("does not count an empty entry as filled", () => {
    expect(
      sectionProgress(addEntry(emptyAnswers(), "skills")).find((r) => r.id === "skills")?.filled,
    ).toBe(false);
  });
});

describe("answers file", () => {
  it("round-trips, keeping the current revision and a counter that never goes down", () => {
    const original = { ...withRoles(), revision: 7 };
    const current = { ...emptyAnswers(), revision: 2, nextEntry: 50 };
    const result = parseAnswersImport(exportAnswersJson(original), current);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answers.revision).toBe(2);
    expect(result.answers.nextEntry).toBe(50);
    expect(result.answers.experience).toEqual(original.experience);
    expect(result.summary).toMatch(/2 roles/);
  });

  it("rejects text that is not JSON, not our file, or not valid answers", () => {
    const current = emptyAnswers();
    expect(parseAnswersImport("nope", current)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/JSON/),
    });
    expect(parseAnswersImport('{"a":1}', current)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not a Slayply/),
    });
    expect(parseAnswersImport("null", current).ok).toBe(false);
    const bad = JSON.stringify({ kind: "slayply-answers", answers: { schemaVersion: 1 } });
    expect(parseAnswersImport(bad, current)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/not valid/),
    });
  });

  it("rejects an oversized file and unknown fields", () => {
    const current = emptyAnswers();
    expect(parseAnswersImport("x".repeat(1_000_001), current)).toMatchObject({ ok: false });
    const extra = JSON.stringify({
      kind: "slayply-answers",
      answers: { ...emptyAnswers(), evil: 1 },
    });
    expect(parseAnswersImport(extra, current).ok).toBe(false);
  });
});

describe("sanitizeAnswers", () => {
  it("returns the same answers (trimmed) when nothing is wrong", () => {
    const a = setAnswer(emptyAnswers(), ["profile", "name"], " Asha ");
    expect(sanitizeAnswers(a)).toEqual({
      clean: expect.objectContaining({ profile: { name: "Asha" } }),
      dropped: [],
    });
  });

  it("drops a bad field, a bad list as a whole, and keeps the rest", () => {
    let a = addEntry(emptyAnswers(), "experience");
    a = setAnswer(a, ["experience", 0, "company"], "Acme");
    a = setAnswer(a, ["experience", 0, "end"], "pres");
    a = setAnswer(a, ["targets", "roles"], ["ok", "x".repeat(81)]);
    const result = sanitizeAnswers(a);
    expect(result?.dropped.sort()).toEqual(["experience.0.end", "targets.roles"]);
    expect(result?.clean.experience[0]?.company).toBe("Acme");
    expect(result?.clean.targets).not.toHaveProperty("roles");
  });

  it("gives up on structural problems", () => {
    const broken = { ...emptyAnswers(), nextEntry: 0 };
    expect(sanitizeAnswers(broken)).toBeNull();
  });
});

describe("sectionProgress errors", () => {
  it("flags the section an error belongs to", () => {
    const rows = sectionProgress(emptyAnswers(), { "targets.roles": "too long" });
    expect(rows.find((r) => r.id === "targets")?.hasErrors).toBe(true);
    expect(rows.find((r) => r.id === "voice")?.hasErrors).toBe(false);
  });
});

describe("setAt on missing nodes", () => {
  it("creates intermediate objects and arrays", () => {
    expect(setAt({}, ["a", "b"], 1)).toEqual({ a: { b: 1 } });
    expect(setAt({}, ["a", 1, "b"], 1)).toEqual({ a: [undefined, { b: 1 }] });
  });
});
