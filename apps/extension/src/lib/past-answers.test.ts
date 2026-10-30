import type { JobRecord } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { findPastAnswers, MAX_PAST_ANSWERS } from "./past-answers.js";

const job = (id: string, answers: { question: string; text: string }[], over = {}): JobRecord => ({
  id,
  title: "Engineer",
  company: `Co ${id}`,
  location: "",
  jd: "JD",
  status: "applied",
  resumeName: "",
  answers,
  savedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("findPastAnswers", () => {
  const jobs = [
    job("a", [{ question: "Why do you want to work at our company?", text: "Because billing." }]),
    job("b", [{ question: "Are you authorized to work in the US?", text: "Yes." }]),
  ];

  it("finds an answer to a similar question, with the job it came from", () => {
    const [hit] = findPastAnswers("Why do you want to work here at this company?", jobs, "x");
    expect(hit).toMatchObject({ text: "Because billing.", company: "Co a" });
  });

  it("ignores case, punctuation and filler words", () => {
    expect(findPastAnswers("WHY DO YOU WANT TO WORK AT OUR COMPANY", jobs, "x")).toHaveLength(1);
  });

  it("returns nothing for an unrelated question or a blank one", () => {
    expect(findPastAnswers("Describe your favourite database index", jobs, "x")).toEqual([]);
    expect(findPastAnswers("   ", jobs, "x")).toEqual([]);
    expect(findPastAnswers("the of and", jobs, "x")).toEqual([]);
  });

  it("skips the job being worked on", () => {
    expect(findPastAnswers("Why do you want to work at our company?", jobs, "a")).toEqual([]);
  });

  it("skips empty past answers", () => {
    const blank = [job("c", [{ question: "Why do you want to work at our company?", text: " " }])];
    expect(findPastAnswers("Why do you want to work at our company?", blank, "x")).toEqual([]);
  });

  it("returns the best match first and at most the cap", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      job(`j${i}`, [{ question: "Why do you want to work at our company?", text: `A${i}` }], {
        updatedAt: `2026-10-0${i + 1}T00:00:00.000Z`,
      }),
    );
    const hits = findPastAnswers("Why do you want to work at our company?", many, "x");
    expect(hits).toHaveLength(MAX_PAST_ANSWERS);
    expect(hits[0]?.text).toBe("A5");
  });

  it("copes with a very long question and many jobs without slowing down", () => {
    const long = "word ".repeat(1000);
    const start = Date.now();
    findPastAnswers(
      long,
      Array.from({ length: 500 }, (_, i) => job(`j${i}`, [{ question: long, text: "x" }])),
      "x",
    );
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("findPastAnswers: short questions", () => {
  it("matches a short question when its words are exactly the same", () => {
    const jobs = [job("a", [{ question: "Why us?", text: "Because." }])];
    expect(findPastAnswers("why us", jobs, "x")).toHaveLength(1);
    expect(findPastAnswers("Why now?", jobs, "x")).toEqual([]);
  });

  it("does not match on one shared word out of several", () => {
    const jobs = [job("a", [{ question: "Why us?", text: "Because." }])];
    expect(findPastAnswers("Why do you want this billing role", jobs, "x")).toEqual([]);
  });
});
