import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_SHAPE,
  OPTION_LABELS,
  SECTION_IDS,
  SECTION_SHAPES,
  type SectionId,
} from "./context-answers.js";
import { QUESTIONNAIRE, type QuestionDef } from "./questionnaire.js";

const sectionOf = (id: SectionId) => {
  const section = QUESTIONNAIRE.find((s) => s.id === id);
  if (!section) throw new Error(`no section ${id}`);
  return section;
};

describe("questionnaire definition", () => {
  it("has exactly one section per schema section", () => {
    expect(QUESTIONNAIRE.map((s) => s.id).sort()).toEqual([...SECTION_IDS].sort());
  });

  it("asks exactly the schema's fields: none missing, none unknown, none twice", () => {
    for (const id of SECTION_IDS) {
      const fields = Object.keys(SECTION_SHAPES[id].shape).filter((f) => f !== "entryId");
      const asked = sectionOf(id).questions.map((q) => q.path);
      expect(asked.sort(), id).toEqual(fields.sort());
    }
  });

  it("asks the achievement parts the schema defines", () => {
    const group = sectionOf("experience").questions.find((q) => q.path === "achievements")?.group;
    expect(group?.questions.map((q) => q.path).sort()).toEqual(
      Object.keys(ACHIEVEMENT_SHAPE.shape).sort(),
    );
  });

  it("marks only repeatable sections as repeatable, matching the schema", () => {
    const repeatable = SECTION_IDS.filter((id) => "entryId" in SECTION_SHAPES[id].shape);
    expect(
      QUESTIONNAIRE.filter((s) => s.repeatable)
        .map((s) => s.id)
        .sort(),
    ).toEqual([...repeatable].sort());
  });

  it("points every select at a real option list", () => {
    const all: QuestionDef[] = QUESTIONNAIRE.flatMap((s) => s.questions);
    for (const q of all.filter((q) => q.control === "select" || q.control === "multiselect")) {
      expect(q.options && q.options in OPTION_LABELS, q.path).toBe(true);
    }
  });

  it("explains every question: a label, a help text and a limit where text is free", () => {
    const all: QuestionDef[] = QUESTIONNAIRE.flatMap((s) => [
      ...s.questions,
      ...s.questions.flatMap((q) => q.group?.questions ?? []),
    ]);
    for (const q of all) {
      expect(q.label.length, q.path).toBeGreaterThan(0);
      expect(q.help.length, q.path).toBeGreaterThan(0);
      if (!q.group && ["text", "longtext", "list"].includes(q.control)) {
        expect(q.maxChars, q.path).toBeGreaterThan(0);
      }
    }
  });

  it("keeps device-only questions in the private and never-claim sections, and nothing else there", () => {
    for (const section of QUESTIONNAIRE) {
      const localOnly = section.id === "private" || section.id === "neverClaim";
      for (const q of section.questions) {
        expect(q.use === "local_only", `${section.id}.${q.path}`).toBe(localOnly);
      }
    }
  });

  it("states per section what happens to the answers", () => {
    for (const section of QUESTIONNAIRE) {
      const local = section.id === "private" || section.id === "neverClaim";
      expect(section.privacy, section.id).toMatch(
        local ? /never sent/i : /sent to your llm provider/i,
      );
    }
    expect(sectionOf("neverClaim").privacy).toMatch(/not yet applied/i);
  });

  it("asks for the most recent role first and says so", () => {
    const experience = sectionOf("experience");
    expect(experience.intro).toMatch(/current or most recent/i);
    expect(experience.repeatable?.hint).toMatch(/newest first/i);
    expect(experience.questions.filter((q) => q.required).map((q) => q.path)).toEqual([
      "company",
      "title",
      "start",
    ]);
  });
});
