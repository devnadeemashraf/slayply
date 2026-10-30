import { describe, expect, it } from "vitest";
import { isStale, sameDocument } from "./stale-tab.js";

const captured = { tabId: 4, url: "https://boards.greenhouse.io/acme/jobs/1" };

describe("sameDocument", () => {
  it("ignores the hash and a trailing slash, nothing else", () => {
    expect(sameDocument("https://a.com/jobs/1#apply", "https://a.com/jobs/1/")).toBe(true);
    expect(sameDocument("https://a.com/jobs/1", "https://a.com/jobs/2")).toBe(false);
    expect(sameDocument("https://a.com/jobs?id=1", "https://a.com/jobs?id=2")).toBe(false);
    expect(sameDocument("https://a.com/x", "https://b.com/x")).toBe(false);
  });

  it("treats unparseable addresses as equal only when identical", () => {
    expect(sameDocument("nope", "nope")).toBe(true);
    expect(sameDocument("nope", "other")).toBe(false);
  });
});

describe("isStale", () => {
  it("is not stale before anything was captured or when nothing is known about the tab", () => {
    expect(isStale(null, { tabId: 4, url: "https://x.com" })).toBe(false);
    expect(isStale(captured, null)).toBe(false);
  });

  it("is stale when the user moved to another tab", () => {
    expect(isStale(captured, { tabId: 9, url: undefined })).toBe(true);
  });

  it("is stale when the same tab shows another page, including a single-page navigation", () => {
    expect(isStale(captured, { tabId: 4, url: "https://boards.greenhouse.io/acme/jobs/2" })).toBe(
      true,
    );
  });

  it("is not stale on the same page, a hash change, or when the address is hidden", () => {
    expect(isStale(captured, { tabId: 4, url: `${captured.url}#apply` })).toBe(false);
    expect(isStale(captured, { tabId: 4, url: undefined })).toBe(false);
  });

  it("never reports stale for a capture whose tab is unknown, only on a changed address", () => {
    const unknown = { tabId: undefined, url: captured.url };
    expect(isStale(unknown, { tabId: 9, url: captured.url })).toBe(false);
    expect(isStale(unknown, { tabId: 9, url: "https://other.com" })).toBe(true);
  });
});

describe("query strings", () => {
  it("ignores tracking and self-rewritten parameters", () => {
    expect(
      sameDocument("https://a.com/jobs/1?utm_source=x&gh_src=y", "https://a.com/jobs/1?ref=z"),
    ).toBe(true);
  });

  it("treats a different job id parameter as another job", () => {
    expect(sameDocument("https://a.com/apply?gh_jid=1", "https://a.com/apply?gh_jid=2")).toBe(
      false,
    );
    expect(
      sameDocument("https://l.com/jobs?currentJobId=1&x=1", "https://l.com/jobs?currentJobId=2"),
    ).toBe(false);
    expect(
      sameDocument("https://l.com/jobs?currentJobId=1", "https://l.com/jobs?currentJobId=1&utm=2"),
    ).toBe(true);
  });
});
