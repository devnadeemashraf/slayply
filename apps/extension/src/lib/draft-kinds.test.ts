import { describe, expect, it } from "vitest";
import { DRAFT_KINDS, draftKind, RELOCATION_QUESTION, shiftLength } from "./draft-kinds.js";

describe("draft kinds", () => {
  it("lists answers first, then the four drafts the spec names", () => {
    expect(DRAFT_KINDS.map((kind) => kind.id)).toEqual([
      "answers",
      "cover_letter",
      "message",
      "email",
      "relocation",
    ]);
  });

  it("maps each kind to a task the contract allows; relocation is an answers task", () => {
    expect(draftKind("cover_letter").task).toBe("cover_letter");
    expect(draftKind("message").task).toBe("message");
    expect(draftKind("email").task).toBe("email");
    expect(draftKind("relocation").task).toBe("answers");
    expect(RELOCATION_QUESTION.length).toBeGreaterThan(20);
  });

  it("only drafts take a character limit", () => {
    expect(draftKind("answers").takesLimit).toBe(false);
    for (const id of ["cover_letter", "message", "email", "relocation"] as const) {
      expect(draftKind(id).takesLimit).toBe(true);
    }
  });
});

describe("shiftLength", () => {
  it("steps shorter and longer", () => {
    expect(shiftLength("medium", "shorter")).toBe("short");
    expect(shiftLength("medium", "longer")).toBe("long");
  });

  it("stops at the ends", () => {
    expect(shiftLength("short", "shorter")).toBe("short");
    expect(shiftLength("long", "longer")).toBe("long");
  });
});
