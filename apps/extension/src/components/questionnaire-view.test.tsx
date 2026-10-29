import { emptyAnswers, QUESTIONNAIRE } from "@slayply/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { addEntry, addGroupItem, sectionProgress, setAnswer } from "../lib/questionnaire-state.js";
import { type FormHandlers, SectionForm, StepNav } from "./questionnaire-view.js";

const noop = () => undefined;
const handlers: FormHandlers = {
  onChange: noop,
  onBlur: noop,
  onAddEntry: noop,
  onRemoveEntry: noop,
  onMoveEntry: noop,
  onAddGroupItem: noop,
  onRemoveGroupItem: noop,
};

const sectionOf = (id: string) => {
  const section = QUESTIONNAIRE.find((s) => s.id === id);
  if (!section) throw new Error(id);
  return section;
};

function render(id: string, answers = emptyAnswers(), errors: Record<string, string> = {}) {
  return renderToString(
    <SectionForm section={sectionOf(id)} answers={answers} errors={errors} handlers={handlers} />,
  );
}

describe("SectionForm", () => {
  it("renders every section with its title, intro and data statement", () => {
    for (const section of QUESTIONNAIRE) {
      const html = render(section.id);
      expect(html).toContain(section.title);
      expect(html).toContain(section.privacy.replace(/'/g, "&#x27;"));
    }
  });

  it("labels every question of a single section and explains it", () => {
    const html = render("profile");
    for (const q of sectionOf("profile").questions) {
      expect(html).toContain(q.label);
      expect(html).toContain(q.help);
    }
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Not answered");
  });

  it("says the private section never leaves the device and never-claim is not applied yet", () => {
    expect(render("private")).toMatch(/never sent/i);
    expect(render("neverClaim")).toMatch(/not yet applied/i);
  });

  it("shows the current role fields, in order, with the newest-first hint", () => {
    const html = render("experience", addEntry(emptyAnswers(), "experience"));
    expect(html).toMatch(/Newest first/);
    const order = [
      "Company",
      "Job title",
      "Employment type",
      "Start month",
      "End month",
      "Achievements",
    ];
    const positions = order.map((label) => html.indexOf(label));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("Role 1");
    expect(html).toContain("(needed to use this entry)");
  });

  it("shows values, entry summary and disables the move that is not possible", () => {
    let a = addEntry(addEntry(emptyAnswers(), "experience"), "experience");
    a = setAnswer(a, ["experience", 0, "company"], "Acme");
    a = setAnswer(a, ["experience", 0, "title"], "Engineer");
    const html = render("experience", a);
    expect(html).toContain("Role 1: Engineer at Acme");
    expect(html).toContain('value="Acme"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Remove role 2");
  });

  it("offers no add button at the entry limit", () => {
    let a = emptyAnswers();
    for (let i = 0; i < 4; i += 1) a = addEntry(a, "education");
    expect(render("education", a)).not.toContain("Add education");
    expect(render("education", emptyAnswers())).toContain("Add education");
  });

  it("renders achievement slots and an add button until three", () => {
    let a = addEntry(emptyAnswers(), "experience");
    a = addGroupItem(a, ["experience", 0, "achievements"], 3);
    expect(render("experience", a)).toContain("What you did");
    expect(render("experience", a)).toContain("Add achievement");
    for (let i = 0; i < 2; i += 1) a = addGroupItem(a, ["experience", 0, "achievements"], 3);
    expect(render("experience", a)).not.toContain("Add achievement");
  });

  it("shows an inline error for the field and marks it invalid", () => {
    const a = addEntry(emptyAnswers(), "experience");
    const html = render("experience", a, {
      "experience.0.end": "Use the format YYYY-MM, for example 2024-03.",
    });
    expect(html).toContain("Use the format YYYY-MM");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
  });

  it("renders typed text as text, never as HTML", () => {
    const a = setAnswer(emptyAnswers(), ["profile", "name"], '"><img src=x onerror=alert(1)>');
    const html = render("profile", a);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders a list as one item per line", () => {
    const a = setAnswer(emptyAnswers(), ["targets", "roles"], ["FDE", "Backend"]);
    expect(render("targets", a)).toContain("FDE\nBackend");
  });
});

describe("StepNav", () => {
  it("shows the step, marks answered sections and disables Back on the first step", () => {
    const a = setAnswer(emptyAnswers(), ["voice", "tone"], "warm");
    const html = renderToString(
      <StepNav progress={sectionProgress(a)} current={0} onSelect={noop} />,
    );
    expect(html).toContain("Step 1 of 11");
    expect(html).toContain("1 of 11 sections have answers");
    expect(html).toContain("✓ Writing voice");
    expect(html).toMatch(/disabled=""[^>]*>Back/);
  });
});
