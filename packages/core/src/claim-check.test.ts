import { describe, expect, it } from "vitest";
import { checkClaims, removeSentence, summarizeClaims } from "./claim-check.js";

const PROFILE = {
  facts: [
    { id: "F01", text: "Led a team of 4 engineers at Acme." },
    { id: "F02", text: "Cut p95 latency by 40%." },
  ],
  stories: [{ id: "S01", text: "Rebuilt the billing pipeline after an outage." }],
};

function statuses(text: string, claims: { sentence: string; factIds: string[] }[]) {
  return checkClaims(text, claims, PROFILE).map((s) => s.status);
}

describe("checkClaims", () => {
  it("marks a first-person sentence with a valid citation as cited and snapshots the fact", () => {
    const [sentence] = checkClaims(
      "I led a team of four.",
      [{ sentence: "I led a team of four.", factIds: ["F01"] }],
      PROFILE,
    );
    expect(sentence?.status).toBe("cited");
    expect(sentence?.cited).toEqual([{ id: "F01", text: "Led a team of 4 engineers at Acme." }]);
  });

  it("accepts a story ID", () => {
    expect(
      statuses("I rebuilt billing.", [{ sentence: "I rebuilt billing.", factIds: ["S01"] }]),
    ).toEqual(["cited"]);
  });

  it("flags a first-person sentence the model never listed as a claim", () => {
    expect(statuses("I led a team of four.", [])).toEqual(["uncited"]);
  });

  it("flags a claim with no fact IDs", () => {
    expect(statuses("I led a team.", [{ sentence: "I led a team.", factIds: [] }])).toEqual([
      "uncited",
    ]);
  });

  it("flags an ID that is not in the profile that was sent", () => {
    const [sentence] = checkClaims(
      "I led a team.",
      [{ sentence: "I led a team.", factIds: ["F99"] }],
      PROFILE,
    );
    expect(sentence?.status).toBe("uncited");
    expect(sentence?.invalidIds).toEqual(["F99"]);
  });

  it("flags a sentence that mixes a real ID with a forged one", () => {
    const [sentence] = checkClaims(
      "I cut latency.",
      [{ sentence: "I cut latency.", factIds: ["F02", "F77"] }],
      PROFILE,
    );
    expect(sentence?.status).toBe("uncited");
    expect(sentence?.invalidIds).toEqual(["F77"]);
  });

  it("does not match a paraphrased claim sentence", () => {
    expect(
      statuses("I led a team of four.", [{ sentence: "I led four engineers.", factIds: ["F01"] }]),
    ).toEqual(["uncited"]);
  });

  it("matches despite spacing, trailing punctuation and curly quotes", () => {
    expect(
      statuses("I’m   proud of the  latency win!", [
        { sentence: "I'm proud of the latency win", factIds: ["F02"] },
      ]),
    ).toEqual(["cited"]);
  });

  it("merges the IDs of several claims for the same sentence", () => {
    const [sentence] = checkClaims(
      "I led the team and cut latency.",
      [
        { sentence: "I led the team and cut latency.", factIds: ["F01"] },
        { sentence: "I led the team and cut latency.", factIds: ["F02"] },
      ],
      PROFILE,
    );
    expect(sentence?.factIds).toEqual(["F01", "F02"]);
    expect(sentence?.status).toBe("cited");
  });

  it("treats a sentence with no first-person word as not a claim", () => {
    expect(statuses("The role needs strong Go skills.", [])).toEqual(["not-a-claim"]);
  });

  it.each([
    "I'd",
    "I’ll",
    "My team shipped it.",
    "That was done by me.",
    "It is mine.",
    "I did it myself.",
    "We shipped it.",
    "Our team won.",
    "Us three shipped it.",
  ])("recognises first person in %s", (text) => {
    expect(statuses(text.endsWith(".") ? text : `${text} do it.`, [])).toEqual(["uncited"]);
  });

  it("does not take i.e. or lowercase i inside a word for first person", () => {
    expect(new Set(statuses("The stack, i.e. Go and Postgres, is fixed.", []))).toEqual(
      new Set(["not-a-claim"]),
    );
    expect(statuses("Mine fields and amy are words.", [])).toEqual(["uncited"]);
    expect(statuses("Amy and Minerva joined.", [])).toEqual(["not-a-claim"]);
  });

  it("checks each sentence and each line of a list on its own", () => {
    const text = "I led a team. The firm is large.\n- I cut latency\n- Strong with Go";
    const sentences = checkClaims(
      text,
      [
        { sentence: "I led a team.", factIds: ["F01"] },
        { sentence: "I cut latency", factIds: ["F02"] },
      ],
      PROFILE,
    );
    expect(sentences.map((s) => s.status)).toEqual([
      "cited",
      "not-a-claim",
      "cited",
      "not-a-claim",
    ]);
  });

  it("reports offsets that slice back to the sentence", () => {
    const text = "Hello there.  I led a team.\nBye.";
    for (const sentence of checkClaims(text, [], PROFILE)) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
  });

  it("returns nothing for empty or blank text", () => {
    expect(checkClaims("", [], PROFILE)).toEqual([]);
    expect(checkClaims("  \n \t ", [], PROFILE)).toEqual([]);
  });

  it("ignores prototype-style IDs and never throws on odd input", () => {
    const [sentence] = checkClaims(
      "I did it.",
      [{ sentence: "I did it.", factIds: ["__proto__", "constructor"] }],
      PROFILE,
    );
    expect(sentence?.status).toBe("uncited");
    expect(sentence?.invalidIds).toEqual(["__proto__", "constructor"]);
  });

  it("handles a very long text without catastrophic work", () => {
    const text = "I did a thing. ".repeat(20_000);
    const started = Date.now();
    expect(checkClaims(text, [], PROFILE)).toHaveLength(20_000);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("uses the profile that was sent, so an edited fact keeps its sent text", () => {
    const [sentence] = checkClaims(
      "I led a team.",
      [{ sentence: "I led a team.", factIds: ["F01"] }],
      { facts: [{ id: "F01", text: "Old wording." }], stories: [] },
    );
    expect(sentence?.cited[0]?.text).toBe("Old wording.");
  });
});

describe("removeSentence", () => {
  it("removes the sentence and tidies the spacing", () => {
    const text = "I led a team. I made things up. I cut latency.";
    const target = checkClaims(text, [], PROFILE)[1];
    if (!target) throw new Error("missing sentence");
    expect(removeSentence(text, target)).toBe("I led a team. I cut latency.");
  });

  it("removes the last and the only sentence", () => {
    const text = "Fine. Remove me.";
    const last = checkClaims(text, [], PROFILE)[1];
    if (!last) throw new Error("missing sentence");
    expect(removeSentence(text, last)).toBe("Fine.");
    const only = checkClaims("Just me.", [], PROFILE)[0];
    if (!only) throw new Error("missing sentence");
    expect(removeSentence("Just me.", only)).toBe("");
  });

  it("removes a list line without leaving a blank line", () => {
    const text = "- one\n- I made it up\n- three";
    const target = checkClaims(text, [], PROFILE)[1];
    if (!target) throw new Error("missing sentence");
    expect(removeSentence(text, target)).toBe("- one\n- three");
  });
});

describe("removeSentence by offset", () => {
  it("removes the right occurrence of a repeated sentence", () => {
    const text = "I did it. Then more. I did it.";
    const sentences = checkClaims(text, [], PROFILE);
    const second = sentences[2];
    if (!second) throw new Error("missing sentence");
    expect(removeSentence(text, second)).toBe("I did it. Then more.");
  });

  it("removes a first sentence that is followed by a new line", () => {
    const text = "Remove me.\nKeep me.";
    const first = checkClaims(text, [], PROFILE)[0];
    if (!first) throw new Error("missing sentence");
    expect(removeSentence(text, first)).toBe("Keep me.");
  });

  it("keeps the other lines when it removes a sentence inside a later line", () => {
    const text = "Line one.\nKeep. Remove me.";
    const target = checkClaims(text, [], PROFILE)[2];
    if (!target) throw new Error("missing sentence");
    expect(removeSentence(text, target)).toBe("Line one.\nKeep.");
  });
});

describe("summarizeClaims", () => {
  it("counts cited and uncited sentences", () => {
    const sentences = checkClaims(
      "I led a team. I made this up. Go is needed.",
      [{ sentence: "I led a team.", factIds: ["F01"] }],
      PROFILE,
    );
    expect(summarizeClaims(sentences)).toEqual({ cited: 1, uncited: 1, other: 1 });
  });
});
