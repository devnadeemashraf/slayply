import { describe, expect, it } from "vitest";
import { explainError } from "./error-copy.js";

describe("explainError", () => {
  it("turns the relay's two-minute stop into advice and offers a retry", () => {
    const explained = explainError("STREAM_TIMEOUT", "The generation took too long");
    expect(explained.message).toMatch(/2 minutes/);
    expect(explained.message).toMatch(/faster model|lower effort/);
  });

  // [code, offers a retry]. A repeat cannot fix a rejected key, a rejected request or an unknown extension.
  const explainedCodes: [string, boolean][] = [
    ["STREAM_TIMEOUT", true],
    ["RATE_LIMITED", true],
    ["TOO_MANY_STREAMS", true],
    ["UPSTREAM_RATE_LIMITED", true],
    ["UPSTREAM_OVERLOADED", true],
    ["UPSTREAM_AUTH", false],
    ["UPSTREAM_REJECTED", false],
    ["UPSTREAM_ERROR", true],
    ["STREAM_INCOMPLETE", true],
    ["FORBIDDEN_ORIGIN", false],
  ];

  it.each(explainedCodes)("explains %s and sets retry to %s", (code, retry) => {
    const explained = explainError(code, "raw relay text");
    expect(explained.message).not.toBe("raw relay text");
    expect(explained.retry).toBe(retry);
  });

  it.each(["NETWORK", "REQUEST_TIMEOUT", "INTERNAL", "TOO_LARGE", "UNKNOWN"])(
    "keeps the text of %s and adds a retry",
    (code) => {
      expect(explainError(code, "Original text")).toEqual({
        message: "Original text",
        retry: true,
      });
    },
  );

  it("keeps the text it came with for an unknown code, with no retry", () => {
    expect(explainError("SOMETHING_NEW", "Original text")).toEqual({
      message: "Original text",
      retry: false,
    });
  });

  it("keeps the relay's wording for the key error so the cause stays recognisable", () => {
    expect(explainError("UPSTREAM_AUTH", "x").message).toContain(
      "The provider rejected the API key",
    );
  });

  it("never tells a Direct Mode user to pick another model, which Direct Mode ignores", () => {
    for (const code of [
      "UPSTREAM_RATE_LIMITED",
      "UPSTREAM_OVERLOADED",
      "UPSTREAM_REJECTED",
      "UPSTREAM_ERROR",
    ]) {
      expect(explainError(code, "x").message, code).toMatch(/another model/);
      const direct = explainError(code, "x", true);
      expect(direct.message, code).not.toMatch(/model|Setup/i);
      expect(direct.retry).toBe(explainError(code, "x").retry);
    }
  });

  it("does not name the relay's environment variable to the user", () => {
    expect(explainError("FORBIDDEN_ORIGIN", "x").message).not.toContain("EXTENSION_IDS");
  });
});
