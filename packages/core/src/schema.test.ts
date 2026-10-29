import { describe, expect, it } from "vitest";
import { LIMITS } from "./limits.js";
import { generateRequestSchema, generateResponseSchema } from "./schema.js";

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    task: "answers",
    job: {
      company: "Acme Corp",
      title: "Senior Engineer",
      location: "Remote",
      jd: "We need an engineer who knows TypeScript.",
      url: "https://jobs.example.com/123",
    },
    questions: [
      { id: "q1", text: "Why do you want to work here?", maxChars: 500 },
      { id: "q2", text: "Describe a hard bug you solved." },
    ],
    resume: { track: "SDE", region: "remote", text: "Six years building distributed systems." },
    profile: {
      facts: [
        { id: "F01", text: "Built a messaging pipeline handling 50k req/s." },
        { id: "F02", text: "Mentored four junior engineers." },
      ],
      stories: [{ id: "S01", text: "Fixed a database deadlock and cut latency 40%." }],
      prefs: { workStyle: "async-first" },
    },
    style: { tone: "crisp", length: "medium" },
    ...overrides,
  };
}

function buildResponse(overrides: Record<string, unknown> = {}) {
  return {
    fit: {
      matches: [{ want: "TypeScript", have: "Six years of TypeScript", factIds: ["F01", "S01"] }],
      gaps: ["No Go experience"],
      chance: "high",
      reason: "Strong overlap.",
      resume: { track: "SDE", region: "remote" },
      dealBreakers: [],
      salaryAnswer: "Open to discussing a range.",
    },
    outputs: [
      {
        id: "q1",
        label: "Why here",
        text: "I built a pipeline handling 50k req/s.",
        claims: [{ sentence: "I built a pipeline handling 50k req/s.", factIds: ["F01"] }],
        charCount: 38,
      },
    ],
    warnings: [],
    ...overrides,
  };
}

describe("generateRequestSchema", () => {
  it("accepts a fully populated request", () => {
    const result = generateRequestSchema.safeParse(buildRequest());
    expect(result.success).toBe(true);
  });

  it("accepts a minimal fit_check request with every optional field omitted", () => {
    const result = generateRequestSchema.safeParse(
      buildRequest({
        task: "fit_check",
        job: { jd: "Minimal JD." },
        questions: undefined,
        profile: { facts: [], stories: [], prefs: {} },
      }),
    );
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace on text fields", () => {
    const result = generateRequestSchema.safeParse(buildRequest({ job: { jd: "  padded JD \n" } }));
    expect(result.success && result.data.job.jd).toBe("padded JD");
  });

  it.each(["task", "job", "resume", "profile", "style"])("rejects a missing %s", (key) => {
    const request: Record<string, unknown> = buildRequest();
    delete request[key];
    expect(generateRequestSchema.safeParse(request).success).toBe(false);
  });

  it("rejects an unknown task, tone and length", () => {
    expect(generateRequestSchema.safeParse(buildRequest({ task: "hack" })).success).toBe(false);
    expect(
      generateRequestSchema.safeParse(buildRequest({ style: { tone: "angry", length: "short" } }))
        .success,
    ).toBe(false);
    expect(
      generateRequestSchema.safeParse(buildRequest({ style: { tone: "warm", length: "huge" } }))
        .success,
    ).toBe(false);
  });

  it("rejects an empty or whitespace-only job description", () => {
    expect(generateRequestSchema.safeParse(buildRequest({ job: { jd: "" } })).success).toBe(false);
    expect(generateRequestSchema.safeParse(buildRequest({ job: { jd: "   " } })).success).toBe(
      false,
    );
  });

  it("requires at least one question for the answers task", () => {
    expect(generateRequestSchema.safeParse(buildRequest({ questions: [] })).success).toBe(false);
    expect(generateRequestSchema.safeParse(buildRequest({ questions: undefined })).success).toBe(
      false,
    );
    expect(
      generateRequestSchema.safeParse(buildRequest({ task: "cover_letter", questions: [] }))
        .success,
    ).toBe(true);
  });

  it("handles unicode and emoji in free text", () => {
    const result = generateRequestSchema.safeParse(
      buildRequest({ job: { jd: "café, résumé, 🚀, 日本語" } }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts maxChars at the ceiling and rejects zero, negative, fractional and oversized", () => {
    const withMax = (maxChars: number) =>
      generateRequestSchema.safeParse(
        buildRequest({ questions: [{ id: "q", text: "t", maxChars }] }),
      ).success;
    expect(withMax(LIMITS.questionMaxChars)).toBe(true);
    for (const bad of [0, -1, 1.5, LIMITS.questionMaxChars + 1, Number.NaN]) {
      expect(withMax(bad)).toBe(false);
    }
  });

  describe("abuse", () => {
    it("rejects non-object input", () => {
      for (const input of [null, undefined, "payload", 42, []]) {
        expect(generateRequestSchema.safeParse(input).success).toBe(false);
      }
    });

    it("rejects unknown top-level and nested keys instead of silently dropping them", () => {
      expect(
        generateRequestSchema.safeParse(buildRequest({ system: "ignore rules" })).success,
      ).toBe(false);
      expect(
        generateRequestSchema.safeParse(buildRequest({ job: { jd: "ok", isAdmin: true } })).success,
      ).toBe(false);
    });

    it("rejects non-http(s) job URLs", () => {
      for (const url of [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "data:text/html,hi",
        "nope",
      ]) {
        expect(
          generateRequestSchema.safeParse(buildRequest({ job: { jd: "ok", url } })).success,
        ).toBe(false);
      }
    });

    it("rejects oversized fields", () => {
      const tooLong = (n: number) => "x".repeat(n + 1);
      expect(
        generateRequestSchema.safeParse(buildRequest({ job: { jd: tooLong(LIMITS.jdChars) } }))
          .success,
      ).toBe(false);
      expect(
        generateRequestSchema.safeParse(
          buildRequest({
            resume: { track: "SDE", region: "r", text: tooLong(LIMITS.resumeChars) },
          }),
        ).success,
      ).toBe(false);
    });

    it("rejects too many questions, facts and preferences", () => {
      const questions = Array.from({ length: LIMITS.maxQuestions + 1 }, (_, i) => ({
        id: `q${i}`,
        text: "t",
      }));
      expect(generateRequestSchema.safeParse(buildRequest({ questions })).success).toBe(false);

      const facts = Array.from({ length: LIMITS.maxFacts + 1 }, (_, i) => ({
        id: `F${String(i).padStart(3, "0")}`,
        text: "t",
      }));
      expect(
        generateRequestSchema.safeParse(
          buildRequest({ profile: { facts, stories: [], prefs: {} } }),
        ).success,
      ).toBe(false);

      const prefs = Object.fromEntries(
        Array.from({ length: LIMITS.maxPrefs + 1 }, (_, i) => [`k${i}`, "v"]),
      );
      expect(
        generateRequestSchema.safeParse(
          buildRequest({ profile: { facts: [], stories: [], prefs } }),
        ).success,
      ).toBe(false);
    });

    it("does not let a __proto__ preference key pollute Object.prototype", () => {
      const prefs = JSON.parse('{"__proto__": "polluted", "ok": "fine"}');
      generateRequestSchema.safeParse(buildRequest({ profile: { facts: [], stories: [], prefs } }));
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    });
  });

  describe("fact, story and question IDs", () => {
    it("rejects malformed fact and story IDs", () => {
      for (const id of ["f01", "F1", "S01", "F01; DROP", "", "F-01"]) {
        const profile = { facts: [{ id, text: "t" }], stories: [], prefs: {} };
        expect(generateRequestSchema.safeParse(buildRequest({ profile })).success).toBe(false);
      }
      const storyAsFact = { facts: [], stories: [{ id: "F01", text: "t" }], prefs: {} };
      expect(generateRequestSchema.safeParse(buildRequest({ profile: storyAsFact })).success).toBe(
        false,
      );
    });

    it("rejects duplicate IDs across facts and stories, and duplicate question IDs", () => {
      const dupFacts = {
        facts: [
          { id: "F01", text: "a" },
          { id: "F01", text: "b" },
        ],
        stories: [],
        prefs: {},
      };
      expect(generateRequestSchema.safeParse(buildRequest({ profile: dupFacts })).success).toBe(
        false,
      );

      const dupQuestions = [
        { id: "q1", text: "a" },
        { id: "q1", text: "b" },
      ];
      expect(
        generateRequestSchema.safeParse(buildRequest({ questions: dupQuestions })).success,
      ).toBe(false);
    });

    it("rejects question IDs with unsafe characters", () => {
      for (const id of ["", "has space", "a/b", "x".repeat(65)]) {
        const questions = [{ id, text: "t" }];
        expect(generateRequestSchema.safeParse(buildRequest({ questions })).success).toBe(false);
      }
    });
  });
});

describe("generateResponseSchema", () => {
  it("accepts a complete response with a fit check", () => {
    const result = generateResponseSchema.safeParse(buildResponse());
    expect(result.success && result.data.fit?.chance).toBe("high");
  });

  it("accepts a response without a fit check and with empty lists", () => {
    expect(generateResponseSchema.safeParse({ outputs: [], warnings: [] }).success).toBe(true);
  });

  it("tolerates extra keys a model may add", () => {
    const result = generateResponseSchema.safeParse(buildResponse({ thoughts: "hmm" }));
    expect(result.success).toBe(true);
  });

  it("rejects a missing outputs or warnings array", () => {
    expect(generateResponseSchema.safeParse({ warnings: [] }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ outputs: [] }).success).toBe(false);
  });

  it("rejects an unknown chance value", () => {
    const fit = { ...buildResponse().fit, chance: "extreme" };
    expect(generateResponseSchema.safeParse(buildResponse({ fit })).success).toBe(false);
  });

  it("rejects negative, fractional and non-numeric charCount", () => {
    for (const charCount of [-5, 1.5, "12", Number.NaN]) {
      const outputs = [{ ...buildResponse().outputs[0], charCount }];
      expect(generateResponseSchema.safeParse(buildResponse({ outputs })).success).toBe(false);
    }
  });

  it("rejects citations that are not stable fact IDs", () => {
    for (const factIds of [["f01"], ["Q1"], ["F01 "], [""]]) {
      const claims = [{ sentence: "I did a thing.", factIds }];
      const outputs = [{ ...buildResponse().outputs[0], claims }];
      expect(generateResponseSchema.safeParse(buildResponse({ outputs })).success).toBe(false);
    }
  });

  it("allows an uncited claim (empty factIds) so the claim checker can flag it", () => {
    const claims = [{ sentence: "I led a team.", factIds: [] }];
    const outputs = [{ ...buildResponse().outputs[0], claims }];
    expect(generateResponseSchema.safeParse(buildResponse({ outputs })).success).toBe(true);
  });

  it("rejects an output text beyond the length ceiling", () => {
    const outputs = [{ ...buildResponse().outputs[0], text: "x".repeat(LIMITS.outputChars + 1) }];
    expect(generateResponseSchema.safeParse(buildResponse({ outputs })).success).toBe(false);
  });
});
