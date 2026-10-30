import { describe, expect, it, vi } from "vitest";
import {
  CAPTURE_TEXT_MAX,
  captureFromTab,
  captureOneClick,
  isLinkedInUrl,
  parsePending,
  type TabInfo,
} from "./capture.js";
import { LINKEDIN_URL } from "./capture-fixtures.js";
import type { PageSnapshot } from "./page-snapshot.js";

const snapshot: PageSnapshot = {
  title: "Senior Engineer at Acme",
  ogTitle: "",
  ogSiteName: "",
  jsonLd: [],
  text: "A real job description that is long enough to be useful.",
  questions: [{ label: "Why us?", type: "longtext", required: true, maxChars: 500 }],
};

const tab = (url: string): TabInfo => ({ id: 7, url, title: "Senior Engineer at Acme" });

describe("isLinkedInUrl", () => {
  it.each([
    "https://www.linkedin.com/jobs/view/1",
    "https://linkedin.com/jobs",
    "https://uk.linkedin.com/jobs",
    "https://www.linkedin.com./jobs/1",
    "https://WWW.LinkedIn.COM/jobs",
    "https://www.linkedin.cn/jobs",
    "https://lnkd.in/abc",
  ])("treats %s as LinkedIn", (url) => expect(isLinkedInUrl(url)).toBe(true));

  it.each([
    "https://boards.greenhouse.io/acme/jobs/1",
    "https://notlinkedin.com/",
    "https://linkedin.com.evil.example/",
  ])("does not treat %s as LinkedIn", (url) => expect(isLinkedInUrl(url)).toBe(false));

  it("fails closed on a URL it cannot parse", () => {
    expect(isLinkedInUrl("")).toBe(true);
    expect(isLinkedInUrl("not a url")).toBe(true);
  });
});

describe("captureFromTab", () => {
  it("reads the visible page on a non-LinkedIn board", async () => {
    const result = await captureFromTab("page", tab("https://boards.greenhouse.io/acme/jobs/1"), {
      readPage: async () => snapshot,
      readSelection: vi.fn(),
    });
    expect(result).toMatchObject({ ok: true, capture: { kind: "jd", text: snapshot.text } });
    if (result.ok) expect(result.capture.fields.title).toBe("Senior Engineer");
    expect(result.ok && result.capture.questions).toEqual(snapshot.questions);
    expect(result.ok && result.capture.fromPage).toBe(true);
  });

  it("never reads the page on LinkedIn, and says why", async () => {
    const readPage = vi.fn();
    const result = await captureFromTab("page", tab(LINKEDIN_URL), {
      readPage,
      readSelection: vi.fn(),
    });
    expect(readPage).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/LinkedIn/);
  });

  it("never reads the page on a tab with no URL", async () => {
    const readPage = vi.fn();
    const result = await captureFromTab(
      "page",
      { id: 1, url: undefined, title: "" },
      { readPage, readSelection: vi.fn() },
    );
    expect(readPage).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("captures an explicit selection on LinkedIn", async () => {
    const result = await captureFromTab("selection", tab(LINKEDIN_URL), {
      readPage: vi.fn(),
      readSelection: async () => "Selected job text",
    });
    expect(result).toMatchObject({ ok: true, capture: { text: "Selected job text" } });
  });

  it("reports an empty selection instead of capturing nothing", async () => {
    const result = await captureFromTab("selection", tab("https://example.com/"), {
      readPage: vi.fn(),
      readSelection: async () => "   ",
    });
    expect(result.ok).toBe(false);
  });

  it("turns a blocked page (browser pages, store pages) into a message", async () => {
    const result = await captureFromTab("page", tab("https://example.com/"), {
      readPage: async () => {
        throw new Error("Cannot access contents of the page");
      },
      readSelection: vi.fn(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/toolbar icon|right-click/i);
  });

  it("caps captured text", async () => {
    const result = await captureFromTab("selection", tab("https://example.com/"), {
      readPage: vi.fn(),
      readSelection: async () => "a".repeat(CAPTURE_TEXT_MAX + 500),
    });
    expect(result.ok && result.capture.text.length).toBe(CAPTURE_TEXT_MAX);
  });
});

describe("parsePending", () => {
  const good = {
    kind: "question",
    text: "Why us?",
    url: "https://example.com/",
    fields: { title: "", company: "", location: "", salary: "" },
    questions: [],
  };

  it("accepts a well-formed capture", () => {
    expect(parsePending(good)).toEqual({ ok: true, capture: good });
  });

  it("passes an error message through", () => {
    expect(parsePending({ error: "Nope" })).toEqual({ ok: false, message: "Nope" });
  });

  it.each([
    null,
    5,
    "x",
    {},
    { ...good, kind: "script" },
    { ...good, text: 3 },
    { ...good, fields: null },
  ])("rejects %j", (value) => expect(parsePending(value)).toBeNull());

  it("keeps the page flag through the inbox", () => {
    expect(parsePending({ ...good, fromPage: true })).toMatchObject({
      ok: true,
      capture: { fromPage: true },
    });
    expect(parsePending({ ...good, fromPage: "yes" })).toEqual({ ok: true, capture: good });
  });

  it("accepts a capture saved without questions", () => {
    const { questions: _omitted, ...older } = good;
    expect(parsePending(older)).toEqual({ ok: true, capture: good });
  });

  it("keeps well-formed questions", () => {
    const questions = [{ label: "Why us?", type: "longtext", required: true, maxChars: null }];
    expect(parsePending({ ...good, questions })).toMatchObject({
      ok: true,
      capture: { questions },
    });
  });

  it("keeps the capture but drops questions that are malformed", () => {
    expect(parsePending({ ...good, questions: "nope" })).toEqual({ ok: true, capture: good });
  });

  it("drops questions with an absurd character limit", () => {
    const questions = [
      { label: "Q", type: "text", required: false, maxChars: 9_007_199_254_740_991 },
    ];
    expect(parsePending({ ...good, questions })).toEqual({ ok: true, capture: good });
  });

  it("tolerates a snapshot that has no questions field", async () => {
    const { questions: _omitted, ...older } = snapshot;
    const result = await captureFromTab("page", tab("https://example.com/"), {
      readPage: async () => older as unknown as PageSnapshot,
      readSelection: vi.fn(),
    });
    expect(result.ok && result.capture.questions).toEqual([]);
  });

  it.each([
    "nope",
    [null],
    [{ label: "", type: "text", required: false, maxChars: null }],
    [{ label: "Q", type: "script", required: false, maxChars: null }],
    [{ label: "Q", type: "text", required: "yes", maxChars: null }],
    [{ label: "Q", type: "text", required: false, maxChars: -5 }],
    Array.from({ length: 41 }, () => ({
      label: "Q",
      type: "text",
      required: false,
      maxChars: null,
    })),
  ])("drops malformed questions %j and keeps the capture", (questions) => {
    expect(parsePending({ ...good, questions })).toEqual({ ok: true, capture: good });
  });

  it("drops an oversized text rather than staging it", () => {
    expect(parsePending({ ...good, text: "a".repeat(CAPTURE_TEXT_MAX + 1) })).toBeNull();
  });
});

describe("captureOneClick", () => {
  const board = tab("https://boards.greenhouse.io/acme/jobs/1");

  it("uses the selection when there is one, without reading the page", async () => {
    const readPage = vi.fn();
    const result = await captureOneClick(board, {
      readPage,
      readSelection: async () => "Only this paragraph",
    });
    expect(readPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, capture: { text: "Only this paragraph" } });
  });

  it("reads the visible page when nothing is selected", async () => {
    const result = await captureOneClick(board, {
      readPage: async () => snapshot,
      readSelection: async () => "",
    });
    expect(result).toMatchObject({ ok: true, capture: { text: snapshot.text } });
  });

  it("on LinkedIn with no selection, reads nothing and asks for a selection", async () => {
    const readPage = vi.fn();
    const result = await captureOneClick(tab(LINKEDIN_URL), {
      readPage,
      readSelection: async () => "",
    });
    expect(readPage).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/select/i);
  });

  it("on LinkedIn with a selection, captures just the selection", async () => {
    const readPage = vi.fn();
    const result = await captureOneClick(tab(LINKEDIN_URL), {
      readPage,
      readSelection: async () => "Selected on LinkedIn",
    });
    expect(readPage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, capture: { text: "Selected on LinkedIn" } });
  });

  it("explains a restricted page in one line", async () => {
    const boom = async () => {
      throw new Error("Cannot access chrome:// pages");
    };
    const result = await captureOneClick(tab("chrome://extensions"), {
      readPage: boom,
      readSelection: boom,
    });
    expect(result.ok).toBe(false);
  });
});
