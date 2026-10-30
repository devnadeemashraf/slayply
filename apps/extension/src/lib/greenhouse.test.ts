import { describe, expect, it, vi } from "vitest";
import {
  createGreenhouseReader,
  fetchGreenhouseJob,
  GREENHOUSE_API_ORIGIN,
  mergeGreenhouseJob,
  parseGreenhouseJob,
  parseGreenhouseJobUrl,
} from "./greenhouse.js";

const API_JOB = {
  id: 4012345,
  title: "Senior Platform Engineer",
  company_name: "Acme Robotics",
  location: { name: "Berlin, Germany" },
  content: "&lt;p&gt;Long job html&lt;/p&gt;",
  questions: [
    { required: true, label: "First Name", fields: [{ name: "first_name", type: "input_text" }] },
    { required: true, label: "Email", fields: [{ name: "email", type: "input_text" }] },
    { required: true, label: "Resume/CV", fields: [{ name: "resume", type: "input_file" }] },
    {
      required: true,
      label: "Why do you want to work at Acme Robotics?",
      fields: [{ name: "question_9001", type: "textarea" }],
    },
    {
      required: false,
      label: "How did you hear about this job?",
      fields: [{ name: "question_9002", type: "input_text" }],
    },
    {
      required: true,
      label: "Are you authorized to work in Germany?",
      fields: [
        {
          name: "question_9003",
          type: "multi_value_single_select",
          values: [
            { label: "Yes", value: 1 },
            { label: "No", value: 0 },
          ],
        },
      ],
    },
    {
      required: false,
      label: "Upload a portfolio",
      fields: [{ name: "question_9004", type: "input_file" }],
    },
  ],
  demographic_questions: { questions: [{ label: "Gender" }] },
};

describe("parseGreenhouseJobUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/4012345", { board: "acme", jobId: "4012345" }],
    [
      "https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x",
      { board: "acme", jobId: "4012345" },
    ],
    [
      "https://job-boards.eu.greenhouse.io/acme-eu/jobs/77#apply",
      { board: "acme-eu", jobId: "77" },
    ],
    [
      "https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345",
      { board: "acme", jobId: "4012345" },
    ],
  ])("reads %s", (url, expected) => {
    expect(parseGreenhouseJobUrl(url)).toEqual(expected);
  });

  it.each([
    "https://boards.greenhouse.io.evil.example/acme/jobs/1",
    "https://evilgreenhouse.io/acme/jobs/1",
    "https://example.com/acme/jobs/1",
    "http://boards.greenhouse.io/acme/jobs/1",
    "https://boards.greenhouse.io/acme",
    "https://boards.greenhouse.io/acme/jobs/abc",
    "https://boards.greenhouse.io/ac%2Fme/jobs/1",
    "https://boards.greenhouse.io/acme/jobs/1234567890123456",
    "https://boards.greenhouse.io/embed/job_app?for=a/b&token=1",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(parseGreenhouseJobUrl(url)).toBeNull();
  });
});

describe("parseGreenhouseJob", () => {
  it("keeps the custom questions, with types and required flags", () => {
    const job = parseGreenhouseJob(API_JOB);
    expect(job?.questions).toEqual([
      {
        label: "Why do you want to work at Acme Robotics?",
        type: "longtext",
        required: true,
        maxChars: null,
      },
      { label: "How did you hear about this job?", type: "text", required: false, maxChars: null },
      {
        label: "Are you authorized to work in Germany?",
        type: "choice",
        required: true,
        maxChars: null,
      },
    ]);
  });

  it("leaves out identity fields, uploads and demographic questions", () => {
    const labels =
      parseGreenhouseJob(API_JOB)
        ?.questions.map((q) => q.label)
        .join("|") ?? "";
    for (const skipped of ["First Name", "Email", "Resume", "portfolio", "Gender"]) {
      expect(labels).not.toContain(skipped);
    }
  });

  it("reads the title, company and location", () => {
    expect(parseGreenhouseJob(API_JOB)).toMatchObject({
      title: "Senior Platform Engineer",
      company: "Acme Robotics",
      location: "Berlin, Germany",
    });
  });

  it.each([null, "x", 5, [], {}, { questions: "no" }, { questions: [null, 1, {}] }])(
    "survives hostile data %j",
    (data) => {
      const job = parseGreenhouseJob(data);
      expect(job === null || Array.isArray(job.questions)).toBe(true);
    },
  );

  it("caps the number and length of questions", () => {
    const many = {
      questions: Array.from({ length: 200 }, (_, i) => ({
        required: false,
        label: `${"Q".repeat(1000)}${i}`,
        fields: [{ name: `question_${i}`, type: "textarea" }],
      })),
    };
    const job = parseGreenhouseJob(many);
    expect(job?.questions.length).toBeLessThanOrEqual(40);
    expect(job?.questions.every((q) => q.label.length <= 300)).toBe(true);
  });
});

describe("mergeGreenhouseJob", () => {
  const dom = {
    questions: [
      {
        label: "Why do you want to work at Acme Robotics?",
        type: "longtext" as const,
        required: true,
        maxChars: 1200,
      },
      { label: "Dom only", type: "text" as const, required: false, maxChars: null },
    ],
    fields: { title: "", company: "", location: "", salary: "€90k" },
  };

  it("keeps the page's character limit and adds questions the page did not show", () => {
    const merged = mergeGreenhouseJob(dom, parseGreenhouseJob(API_JOB));
    expect(merged.questions[0]).toMatchObject({
      label: "Why do you want to work at Acme Robotics?",
      maxChars: 1200,
    });
    const labels = merged.questions.map((q) => q.label);
    expect(labels).toContain("Are you authorized to work in Germany?");
    expect(labels).toContain("Dom only");
  });

  it("fills only empty job fields", () => {
    const merged = mergeGreenhouseJob(
      { ...dom, fields: { title: "My title", company: "", location: "", salary: "€90k" } },
      parseGreenhouseJob(API_JOB),
    );
    expect(merged.fields).toEqual({
      title: "My title",
      company: "Acme Robotics",
      location: "Berlin, Germany",
      salary: "€90k",
    });
  });

  it("returns the page result unchanged when there is no API result", () => {
    expect(mergeGreenhouseJob(dom, null)).toEqual(dom);
  });
});

describe("fetchGreenhouseJob", () => {
  const json = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, ...init });
  const target = { board: "acme", jobId: "4012345" };

  it("asks the public job endpoint for questions, with no credentials", async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => json(API_JOB));
    expect(await fetchGreenhouseJob(target, fetchFn)).toEqual(API_JOB);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(`${GREENHOUSE_API_ORIGIN}/v1/boards/acme/jobs/4012345?questions=true`);
    expect(init?.credentials).toBe("omit");
    expect(init?.method ?? "GET").toBe("GET");
  });

  it("returns null on a non-200, a network error or bad JSON", async () => {
    expect(await fetchGreenhouseJob(target, async () => json({}, { status: 404 }))).toBeNull();
    expect(
      await fetchGreenhouseJob(target, async () => {
        throw new TypeError("network");
      }),
    ).toBeNull();
    expect(await fetchGreenhouseJob(target, async () => new Response("{nope"))).toBeNull();
  });

  it("refuses a reply larger than the cap", async () => {
    const big = new Response("x".repeat(3_000_000));
    expect(await fetchGreenhouseJob(target, async () => big)).toBeNull();
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const fetchFn = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    const pending = fetchGreenhouseJob(target, fetchFn, 5_000);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await pending).toBeNull();
    vi.useRealTimers();
  });
});

describe("redirects, declared size and the permission guard", () => {
  const target = { board: "acme", jobId: "1" };

  it("does not follow redirects and refuses a declared oversize body", async () => {
    const fetchFn = vi.fn(
      async (_u: string, _i?: RequestInit) =>
        new Response("{}", { headers: { "content-length": "99999999" } }),
    );
    expect(await fetchGreenhouseJob(target, fetchFn)).toBeNull();
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("matches questions ignoring a required marker and prefers the page's widget type", () => {
    const merged = mergeGreenhouseJob(
      {
        questions: [
          { label: "Authorized to work? *", type: "choice", required: true, maxChars: null },
        ],
        fields: { title: "", company: "", location: "", salary: "" },
      },
      {
        title: "",
        company: "",
        location: "",
        questions: [{ label: "Authorized to work?", type: "text", required: true, maxChars: null }],
      },
    );
    expect(merged.questions).toHaveLength(1);
    expect(merged.questions[0]?.type).toBe("choice");
  });

  it("never fetches without the permission, or for other pages", async () => {
    const fetchFn = vi.fn(async () => new Response("{}"));
    const denied = createGreenhouseReader({ contains: async () => false }, fetchFn);
    const granted = createGreenhouseReader({ contains: async () => true }, fetchFn);
    expect(await denied("https://boards.greenhouse.io/acme/jobs/1")).toBeNull();
    expect(await granted("https://example.com/acme/jobs/1")).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await granted("https://boards.greenhouse.io/acme/jobs/1")).toEqual({});
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
