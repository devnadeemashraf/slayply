import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "./page-snapshot.js";
import { mergeFrameResults, mergeSnapshots } from "./snapshot-merge.js";

const snap = (over: Partial<PageSnapshot>): PageSnapshot => ({
  title: "",
  ogTitle: "",
  ogSiteName: "",
  jsonLd: [],
  text: "",
  questions: [],
  ...over,
});
const q = (label: string) => ({
  label,
  type: "longtext" as const,
  required: false,
  maxChars: null,
});
const long = (word: string) => `${word} `.repeat(80);

describe("mergeSnapshots", () => {
  it("returns null when there is nothing", () => {
    expect(mergeSnapshots([])).toBeNull();
  });

  it("returns a single frame unchanged", () => {
    const only = snap({ title: "Job", text: long("a"), questions: [q("Why?")] });
    expect(mergeSnapshots([only])).toEqual(only);
  });

  it("takes the title and site name from the main frame and the questions from an embedded form", () => {
    const main = snap({ title: "Careers", ogSiteName: "Acme", text: long("job") });
    const form = snap({ title: "Apply", text: long("form"), questions: [q("Why us?")] });
    const merged = mergeSnapshots([main, form]);
    expect(merged?.title).toBe("Careers");
    expect(merged?.ogSiteName).toBe("Acme");
    expect(merged?.questions.map((x) => x.label)).toEqual(["Why us?"]);
  });

  it("joins the text of useful frames, main first, without repeating one", () => {
    const main = snap({ text: long("job") });
    const form = snap({ text: long("form") });
    const dupe = snap({ text: long("job") });
    const merged = mergeSnapshots([main, form, dupe]);
    expect(merged?.text).toContain("job");
    expect(merged?.text).toContain("form");
    expect(merged?.text.split("job").length).toBe(main.text.split("job").length);
  });

  it("ignores tiny frames with nothing in them (ads, trackers)", () => {
    const main = snap({ text: long("job") });
    const ad = snap({ text: "Buy now", title: "Ad" });
    expect(mergeSnapshots([main, ad])?.text).toBe(main.text.trim());
  });

  it("unions structured data and drops duplicate questions", () => {
    const a = snap({ text: long("a"), jsonLd: ["{}"], questions: [q("Why us?")] });
    const b = snap({ text: long("b"), jsonLd: ['{"x":1}'], questions: [q("why us?"), q("Visa?")] });
    const merged = mergeSnapshots([a, b]);
    expect(merged?.jsonLd).toHaveLength(2);
    expect(merged?.questions.map((x) => x.label)).toEqual(["Why us?", "Visa?"]);
  });

  it("caps text at 60,000 characters and questions at 40", () => {
    const frames = Array.from({ length: 5 }, (_, i) =>
      snap({
        text: `${i}`.repeat(30_000),
        questions: Array.from({ length: 20 }, (_, j) => q(`Q ${i}-${j}`)),
      }),
    );
    const merged = mergeSnapshots(frames);
    expect(merged?.text.length).toBeLessThanOrEqual(60_000);
    expect(merged?.questions.length).toBeLessThanOrEqual(40);
  });

  it("falls back to a tiny main frame when every frame is tiny", () => {
    const merged = mergeSnapshots([snap({ text: "Short" }), snap({ text: "Also short" })]);
    expect(merged?.text).toBe("Short");
  });
});

describe("mergeFrameResults", () => {
  const top = snap({ title: "Careers", text: long("job") });
  const form = snap({ title: "Apply", text: long("form"), questions: [q("Why us?")] });

  it("puts the top frame (frame 0) first even when results arrive in another order", () => {
    const merged = mergeFrameResults([
      { frameId: 7, result: form },
      { frameId: 0, result: top },
    ]);
    expect(merged?.title).toBe("Careers");
    expect(merged?.questions).toHaveLength(1);
  });

  it("does not let an embedded frame stand in for a top frame that returned nothing", () => {
    expect(mergeFrameResults([{ frameId: 7, result: form }])).toBeNull();
    expect(
      mergeFrameResults([
        { frameId: 0, result: null },
        { frameId: 7, result: form },
      ]),
    ).toBeNull();
  });

  it("skips frames with no result", () => {
    const merged = mergeFrameResults([
      { frameId: 0, result: top },
      { frameId: 3, result: undefined },
    ]);
    expect(merged).toEqual(top);
  });
});

describe("mergeSnapshots text budget", () => {
  it("keeps room for an application-form frame when the main page is huge", () => {
    const main = snap({ text: `main ${"x".repeat(70_000)}` });
    const form = snap({ text: `FORMTEXT ${"y".repeat(5_000)}`, questions: [q("Why?")] });
    const merged = mergeSnapshots([main, form]);
    expect(merged?.text).toContain("FORMTEXT");
    expect(merged?.text.length).toBeLessThanOrEqual(60_000);
  });

  it("replaces a part with a later frame that contains it, instead of keeping both", () => {
    const small = snap({ text: long("job") });
    const superset = snap({ text: `${long("job")}${long("extra")}` });
    const merged = mergeSnapshots([small, superset]);
    expect(merged?.text.split("job").length).toBe(superset.text.split("job").length);
  });

  it("keeps a short frame that has a form even if its text repeats part of the page", () => {
    const main = snap({ text: `${long("job")} Apply now` });
    const form = snap({ text: "Apply now", questions: [q("Why us?")] });
    expect(mergeSnapshots([main, form])?.questions).toHaveLength(1);
  });
});
