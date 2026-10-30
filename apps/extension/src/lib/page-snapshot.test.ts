import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { LINKEDIN_HOSTS } from "./capture.js";
import { GREENHOUSE_HTML, LEVER_HTML, NO_STRUCTURE_HTML } from "./capture-fixtures.js";
import { selectionText, snapshotPage } from "./page-snapshot.js";

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

  it("refuses LinkedIn hosts itself, even inside an embedded frame, without reading anything", () => {
    for (const hostname of [
      "www.linkedin.com",
      "linkedin.com.",
      "WWW.LINKEDIN.COM",
      "uk.linkedin.cn",
      "lnkd.in",
    ]) {
      let touched = false;
      const trap = new Proxy(
        {},
        {
          get() {
            touched = true;
            throw new Error("must not read");
          },
        },
      );
      const doc = {
        location: { hostname },
        title: "x",
        body: trap,
        querySelector: () => trap,
        querySelectorAll: () => trap,
      } as unknown as Document;
      expect(snapshotPage(doc)).toEqual({
        title: "",
        ogTitle: "",
        ogSiteName: "",
        jsonLd: [],
        text: "",
        questions: [],
      });
      expect(touched).toBe(false);
    }
  });

  it("keeps labelled lines intact", () => {
    const { text } = snapshotPage(docOf(LEVER_HTML));
    expect(text).toContain("Location: Lisbon, Portugal (hybrid)");
  });
});

describe("selectionText", () => {
  const win = (hostname: string, selected: string, isTop: boolean) => {
    const self = {
      location: { hostname },
      getSelection: () => ({ toString: () => selected }),
    } as unknown as Window;
    (self as unknown as { top: unknown }).top = isTop ? self : {};
    return self;
  };

  it("returns the selection on an ordinary page or frame", () => {
    expect(selectionText(win("boards.greenhouse.io", "picked", true))).toBe("picked");
    expect(selectionText(win("boards.greenhouse.io", "in frame", false))).toBe("in frame");
  });

  it("allows an explicit selection on a LinkedIn page itself", () => {
    expect(selectionText(win("www.linkedin.com", "chosen text", true))).toBe("chosen text");
  });

  it("ignores a selection inside a LinkedIn frame embedded in another page", () => {
    expect(selectionText(win("www.linkedin.com", "from a widget", false))).toBe("");
    expect(selectionText(win("lnkd.in.", "from a widget", false))).toBe("");
  });

  it("returns an empty string when there is no selection", () => {
    const none = {
      location: { hostname: "x.com" },
      top: null,
      getSelection: () => null,
    } as unknown as Window;
    expect(selectionText(none)).toBe("");
  });
});

describe("the injected reader and the app agree on what LinkedIn is", () => {
  it("refuses every host the app's own list names", () => {
    for (const host of LINKEDIN_HOSTS) {
      const doc = { location: { hostname: `www.${host}` }, title: "x" } as unknown as Document;
      expect(snapshotPage(doc).text).toBe("");
    }
  });
});
