import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { extractJobFields } from "./capture-fields.js";
import { GREENHOUSE_HTML, LEVER_HTML, NO_STRUCTURE_HTML } from "./capture-fixtures.js";
import { snapshotPage } from "./page-snapshot.js";

const fromHtml = (html: string) =>
  extractJobFields(snapshotPage(parseHTML(html).document as unknown as Document));

describe("extractJobFields", () => {
  it("prefers the structured JobPosting data", () => {
    expect(fromHtml(GREENHOUSE_HTML)).toEqual({
      title: "Senior Platform Engineer",
      company: "Acme Robotics",
      location: "Berlin, DE",
      salary: "EUR 85,000 – 110,000 per year",
    });
  });

  it("falls back to the page title, site name and labelled lines", () => {
    expect(fromHtml(LEVER_HTML)).toEqual({
      title: "Staff Data Engineer",
      company: "Northwind",
      location: "Lisbon, Portugal (hybrid)",
      salary: "€90,000 – €115,000 per year",
    });
  });

  it("returns empty fields instead of guessing", () => {
    const fields = fromHtml(NO_STRUCTURE_HTML);
    expect(fields.company).toBe("");
    expect(fields.location).toBe("");
    // "$5 million" is a single amount, not a pay range.
    expect(fields.salary).toBe("");
  });

  it("splits 'Title at Company' from a bare page title", () => {
    const fields = extractJobFields({ text: "x", title: "Data Analyst at Globex | Jobs" });
    expect(fields.title).toBe("Data Analyst");
    expect(fields.company).toBe("Globex");
  });

  it("marks remote postings in structured data", () => {
    const ld = JSON.stringify({
      "@type": "JobPosting",
      title: "Engineer",
      jobLocationType: "TELECOMMUTE",
    });
    expect(extractJobFields({ text: "", jsonLd: [ld] }).location).toBe("Remote");
  });

  it("finds a job posting inside @graph and ignores other types", () => {
    const ld = JSON.stringify({
      "@graph": [
        { "@type": "Organization", name: "Not a job" },
        { "@type": "JobPosting", title: "Graph Role", hiringOrganization: { name: "Initech" } },
      ],
    });
    const fields = extractJobFields({ text: "", jsonLd: [ld] });
    expect(fields.title).toBe("Graph Role");
    expect(fields.company).toBe("Initech");
  });

  it("survives malformed or hostile structured data", () => {
    const hostile = [
      "{not json",
      JSON.stringify({ "@type": "JobPosting", title: { nested: "object" }, hiringOrganization: 7 }),
      JSON.stringify({ "@type": "JobPosting", title: "x".repeat(10_000) }),
    ];
    const fields = extractJobFields({ text: "", jsonLd: hostile });
    expect(fields.title.length).toBeLessThanOrEqual(120);
    expect(fields.company).toBe("");
  });

  it("reads a pay range and location from a selection with no page data", () => {
    const fields = extractJobFields({
      text: "Salary: $120,000 - $150,000 a year\nLocation: Austin, TX",
    });
    expect(fields.salary).toBe("$120,000 - $150,000 a year");
    expect(fields.location).toBe("Austin, TX");
  });
});
