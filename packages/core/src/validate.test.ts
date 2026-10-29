import { describe, expect, it } from "vitest";
import { MAX_PAYLOAD_BYTES } from "./limits.js";
import {
  formatRetryPrompt,
  validateGenerateRequest,
  validateGenerateResponse,
} from "./validate.js";

const validResponse = {
  outputs: [
    {
      id: "out-1",
      label: "Cover Letter",
      text: "Dear team, I am interested.",
      claims: [{ sentence: "I am interested.", factIds: ["F01"] }],
      charCount: 27,
    },
  ],
  warnings: [],
};

const validRequest = {
  task: "email",
  job: { jd: "Engineering role" },
  resume: { track: "SDE", region: "remote", text: "Bio" },
  profile: { facts: [], stories: [], prefs: {} },
  style: { tone: "crisp", length: "short" },
};

describe("validateGenerateResponse", () => {
  it("accepts an object", () => {
    const result = validateGenerateResponse(validResponse);
    expect(result.success && result.data.outputs[0]?.id).toBe("out-1");
  });

  it("accepts a JSON string", () => {
    const result = validateGenerateResponse(JSON.stringify(validResponse));
    expect(result.success).toBe(true);
  });

  it("reports malformed JSON at the root and keeps the raw text for fallback display", () => {
    const raw = "{ outputs: [ broken";
    const result = validateGenerateResponse(raw);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues[0]?.path).toBe("$");
    expect(result.issues[0]?.message).toMatch(/Invalid JSON/);
    expect(result.rawInput).toBe(raw);
    expect(result.retryPrompt).toContain("valid JSON object");
  });

  it("lists every schema problem with its path in the retry prompt", () => {
    const result = validateGenerateResponse({ outputs: [{ id: "x" }], warnings: "nope" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.issues.map((issue) => issue.path);
    expect(paths).toContain("warnings");
    expect(paths).toContain("outputs.0.label");
    expect(result.retryPrompt).toContain("warnings");
    expect(result.retryPrompt).toContain("outputs.0.label");
  });

  it("rejects null, primitives and arrays", () => {
    for (const input of [null, undefined, 42, true, [], [validResponse]]) {
      const result = validateGenerateResponse(input);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues[0]?.path).toBe("$");
    }
  });

  it("rejects a JSON string that parses to a non-object", () => {
    expect(validateGenerateResponse("42").success).toBe(false);
    expect(validateGenerateResponse("null").success).toBe(false);
    expect(validateGenerateResponse("[]").success).toBe(false);
  });

  it("rejects oversized strings before parsing", () => {
    const result = validateGenerateResponse("x".repeat(MAX_PAYLOAD_BYTES + 1));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.message).toMatch(/exceeds/);
  });
});

describe("validateGenerateRequest", () => {
  it("accepts a valid request object and JSON string", () => {
    expect(validateGenerateRequest(validRequest).success).toBe(true);
    expect(validateGenerateRequest(JSON.stringify(validRequest)).success).toBe(true);
  });

  it("returns structured issues without an LLM retry prompt", () => {
    const result = validateGenerateRequest({ task: "unknown" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect("retryPrompt" in result).toBe(false);
  });

  it("rejects malformed JSON and oversized input", () => {
    expect(validateGenerateRequest("{nope").success).toBe(false);
    expect(validateGenerateRequest("x".repeat(MAX_PAYLOAD_BYTES + 1)).success).toBe(false);
  });

  it("surfaces cross-field rules with a usable path", () => {
    const result = validateGenerateRequest({ ...validRequest, task: "answers" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.map((i) => i.path)).toContain("questions");
  });
});

describe("formatRetryPrompt", () => {
  it("includes each issue and an instruction to return only JSON", () => {
    const prompt = formatRetryPrompt([
      { path: "outputs.0.charCount", message: "Expected number, received string" },
      { path: "warnings", message: "Required" },
    ]);
    expect(prompt).toContain("- outputs.0.charCount: Expected number, received string");
    expect(prompt).toContain("- warnings: Required");
    expect(prompt).toContain("ONLY a valid JSON object");
  });
});
