import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import {
  ARIA_FORM_HTML,
  GREENHOUSE_FORM_HTML,
  GREENHOUSE_HTML,
  LEVER_HTML,
} from "./capture-fixtures.js";
import { snapshotPage } from "./page-snapshot.js";

const questionsOf = (html: string) =>
  snapshotPage(parseHTML(html).document as unknown as Document).questions;

describe("detected application questions", () => {
  it("finds free-text and choice questions with their limits", () => {
    expect(questionsOf(GREENHOUSE_FORM_HTML)).toEqual([
      {
        label: "Why do you want to work at Acme Robotics?",
        type: "longtext",
        required: true,
        maxChars: 1200,
      },
      {
        label: "Describe a system you operated in production (max 500 characters)",
        type: "longtext",
        required: false,
        maxChars: 500,
      },
      {
        label: "Are you legally authorized to work in Germany?",
        type: "choice",
        required: true,
        maxChars: null,
      },
    ]);
  });

  it("skips identity, upload, demographic, hidden and search fields", () => {
    const labels = questionsOf(GREENHOUSE_FORM_HTML).map((q) => q.label);
    for (const skipped of [
      "First Name",
      "Email",
      "Resume",
      "LinkedIn",
      "Gender",
      "honeypot",
      "Search",
    ]) {
      expect(labels.join("|")).not.toContain(skipped);
    }
  });

  it("never reads what the user typed", () => {
    expect(JSON.stringify(questionsOf(GREENHOUSE_FORM_HTML))).not.toContain("must never be read");
    expect(JSON.stringify(questionsOf(GREENHOUSE_FORM_HTML))).not.toContain("jane@example.com");
  });

  it("reads aria-labelledby, fieldset legends, aria-label and placeholders, and drops duplicates", () => {
    expect(questionsOf(ARIA_FORM_HTML).map((q) => [q.label, q.type, q.required])).toEqual([
      ["What is the most interesting problem you have solved recently?", "longtext", true],
      ["Will you now or in the future require visa sponsorship?", "choice", false],
      ["What salary range are you expecting?", "text", false],
      ["Anything else we should know?", "text", false],
      ["Why us?", "longtext", false],
    ]);
  });

  it("does not read a prefilled textarea or select options inside a wrapping label", () => {
    const questions = questionsOf(
      `<html><body><main>
        <label>Why us? <textarea>my prefilled draft</textarea></label>
        <label>Pick a team <select><option>Secret option</option><option>Other</option></select></label>
      </main></body></html>`,
    );
    expect(questions.map((q) => q.label)).toEqual(["Why us?", "Pick a team"]);
    expect(JSON.stringify(questions)).not.toMatch(/prefilled|Secret option/);
  });

  it("skips search boxes however they are marked up", () => {
    const labels = questionsOf(
      `<html><body><main>
        <input type="text" placeholder="Search jobs">
        <input type="text" role="searchbox" aria-label="Find a role">
        <input type="text" role="combobox" aria-label="Pick a city">
        <input type="text" name="site_search" aria-label="Look up anything">
        <textarea aria-label="Why do you want this role?"></textarea>
      </main></body></html>`,
    ).map((q) => q.label);
    expect(labels).toEqual(["Why do you want this role?"]);
  });

  it("keeps real questions that merely contain the word name, address or birth", () => {
    const labels = questionsOf(
      `<html><body><main>
        <label for="a">Name a project you are proud of</label><textarea id="a"></textarea>
        <label for="b">How would you address scaling problems on a growing team?</label><textarea id="b"></textarea>
      </main></body></html>`,
    ).map((q) => q.label);
    expect(labels).toHaveLength(2);
  });

  it("skips identity fields by name, id or label, including long labels", () => {
    const labels = questionsOf(
      `<html><body><main>
        <label for="a">Please enter your current residential address including street and postal code</label><input id="a" name="address_line">
        <label for="b">Passport number</label><input id="b" type="text">
        <label for="c">Anything we should know?</label><input id="c" name="candidate[last_name]">
        <label for="d">Date of birth</label><input id="d" type="text">
      </main></body></html>`,
    ).map((q) => q.label);
    expect(labels).toEqual([]);
  });

  it("only treats a character note as a limit when it says maximum", () => {
    const [min, max] = questionsOf(
      `<html><body><main>
        <label for="a">Write at least 100 characters about yourself</label><textarea id="a"></textarea>
        <label for="b">Tell us why (up to 750 characters)</label><textarea id="b"></textarea>
      </main></body></html>`,
    );
    expect(min?.maxChars).toBeNull();
    expect(max?.maxChars).toBe(750);
  });

  it("keeps a radio group in each form that reuses the same name", () => {
    const labels = questionsOf(
      `<html><body><main>
        <form><fieldset><legend>First form choice?</legend><input type="radio" name="q1"><input type="radio" name="q1"></fieldset></form>
        <form><fieldset><legend>Second form choice?</legend><input type="radio" name="q1"><input type="radio" name="q1"></fieldset></form>
      </main></body></html>`,
    ).map((q) => q.label);
    expect(labels).toEqual(["First form choice?", "Second form choice?"]);
  });

  it("returns none for pages without a form", () => {
    expect(questionsOf(GREENHOUSE_HTML)).toEqual([]);
    expect(questionsOf(LEVER_HTML)).toEqual([]);
  });

  it("reads inside open shadow roots", () => {
    const { document } = parseHTML("<html><body><main><div id='host'></div></main></body></html>");
    const inner = parseHTML(
      "<html><body><label for='s'>Tell us about a time you disagreed with a teammate.</label><textarea id='s'></textarea></body></html>",
    ).document;
    Object.defineProperty(document.getElementById("host"), "shadowRoot", { value: inner });
    const { questions } = snapshotPage(document as unknown as Document);
    expect(questions.map((q) => q.label)).toEqual([
      "Tell us about a time you disagreed with a teammate.",
    ]);
  });

  it("caps the number and length of questions on a hostile page", () => {
    const fields = Array.from(
      { length: 300 },
      (_, i) =>
        `<label for="f${i}">${"Q".repeat(1000)} ${i}</label><textarea id="f${i}"></textarea>`,
    ).join("");
    const questions = questionsOf(`<html><body><main>${fields}</main></body></html>`);
    expect(questions.length).toBeLessThanOrEqual(40);
    expect(questions.every((q) => q.label.length <= 300)).toBe(true);
  });
});
