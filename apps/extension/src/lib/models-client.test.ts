import { describe, expect, it, vi } from "vitest";
import { fetchModels } from "./models-client.js";

function run(fetchFn: (url: string, init?: RequestInit) => Promise<Response>, provider = "openai") {
  return fetchModels({
    baseUrl: "http://relay.test/",
    provider: provider as "openai",
    apiKey: "sk-secret",
    fetchFn,
    signal: new AbortController().signal,
  });
}

describe("fetchModels", () => {
  it("asks the relay for the provider's models with the key in a header only", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({
        provider: "openai",
        models: [
          { id: "gpt-5.1", displayName: "gpt-5.1", supportsEffort: true },
          { id: "gpt-4o", displayName: "GPT-4o" },
        ],
      }),
    );
    const result = await run(fetchFn);
    expect(result).toEqual({
      ok: true,
      models: [
        { id: "gpt-5.1", displayName: "gpt-5.1", supportsEffort: true },
        { id: "gpt-4o", displayName: "GPT-4o", supportsEffort: false },
      ],
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://relay.test/v1/models?provider=openai");
    expect(init.headers).toEqual({ "X-User-OpenAI-Key": "sk-secret" });
  });

  it("uses the relay's static error text when the key is rejected", async () => {
    const result = await run(async () =>
      Response.json(
        { error: { code: "UPSTREAM_AUTH", message: "The provider rejected the API key" } },
        { status: 401 },
      ),
    );
    expect(result).toEqual({ ok: false, message: "The provider rejected the API key" });
  });

  it("fails softly on a network error, a non-JSON body and a wrong shape", async () => {
    for (const fetchFn of [
      async () => Promise.reject(new Error("offline")),
      async () => new Response("<html>", { status: 200 }),
      async () => Response.json({ models: "nope" }),
    ]) {
      const result = await run(fetchFn);
      expect(result.ok).toBe(false);
    }
  });

  it("drops entries with unsafe ids and caps the list", async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ id: `m-${i}`, displayName: `M${i}` }));
    const result = await run(async () =>
      Response.json({
        models: [{ id: "../evil", displayName: "x" }, { id: 5 }, null, ...many],
      }),
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.models).toHaveLength(200);
    expect(result.models.some((model) => model.id.includes("/"))).toBe(false);
  });
});
