import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { GREENHOUSE_HTML, LEVER_HTML, NO_STRUCTURE_HTML } from "./capture-fixtures.js";
import { snapshotPage } from "./page-snapshot.js";

function docOf(html: string): Document {
  return parseHTML(html).document as unknown as Document;
}

describe("snapshotPage", () => {
  it("reads the main content, title, site name and structured data", () => {
    const snap = snapshotPage(docOf(GREENHOUSE_HTML));
    expect(snap.title).toBe("Senior Platform Engineer at Acme Robotics");
    expect(snap.ogSiteName).toBe("Acme Robotics");
    expect(snap.jsonLd).toHaveLength(1);
    expect(snap.text).toContain("control plane for warehouse robots");
  });

  it("leaves out navigation, footer and inline scripts when a main element exists", () => {
    const { text } = snapshotPage(docOf(GREENHOUSE_HTML));
    expect(text).not.toContain("Sign in");
    expect(text).not.toContain("Privacy Terms");
    expect(text).not.toContain("do not capture this");
  });

  it("falls back to the body when there is no main element", () => {
    const { text } = snapshotPage(docOf(NO_STRUCTURE_HTML));
    expect(text).toContain("Join us");
  });

  it("caps the text it returns", () => {
    const html = `<html><body><main>${"word ".repeat(40_000)}</main></body></html>`;
    expect(snapshotPage(docOf(html), 1_000).text.length).toBeLessThanOrEqual(1_000);
  });

  it("still works when rebuilt from its source, as the browser injects it", () => {
    const doc = docOf(GREENHOUSE_HTML);
    const injected = new Function("document", `return (${snapshotPage.toString()})();`);
    expect(injected(doc).text).toContain("control plane for warehouse robots");
  });

  it("keeps labelled lines intact", () => {
    const { text } = snapshotPage(docOf(LEVER_HTML));
    expect(text).toContain("Location: Lisbon, Portugal (hybrid)");
  });
});
