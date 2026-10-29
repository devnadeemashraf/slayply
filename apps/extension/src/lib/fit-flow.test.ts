import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import type { FitResult } from "../components/fit-view.js";
import { buildFitRequest } from "./build-request.js";
import { createFitRunner } from "./fit-flow.js";
import { createFitStore, fitKey } from "./fit-store.js";
import type { GenerationState } from "./generate-controller.js";
import { openProfileDb } from "./profile-store.js";
import { relayStream, sseResponse, validFitReply } from "./testing.js";

let counter = 0;
const JD = "Build billing systems";

function setup(replies: Array<() => Response>) {
  const store = createFitStore(openProfileDb(`slayply-flow-test-${++counter}`));
  const states: GenerationState[] = [];
  const results: FitResult[] = [];
  const fetchFn = vi.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error("unexpected extra request");
    return next();
  });
  const runner = createFitRunner({
    store,
    onState: (state) => states.push(state),
    onResult: (result) => results.push(result),
  });
  const built = buildFitRequest({ jd: JD });
  if (!built.ok) throw new Error("fixture request must be valid");
  const start = (force = false) =>
    runner.start({
      jd: JD,
      force,
      baseUrl: "http://relay.test",
      apiKey: "sk-ant-secret",
      request: built.request,
      fetchFn,
    });
  return { store, states, results, fetchFn, start, stop: () => runner.stop() };
}

const reply = () => sseResponse(relayStream([validFitReply()]));

describe("createFitRunner", () => {
  it("runs the check, reports the result and saves it", async () => {
    const { start, results, store, fetchFn } = setup([reply]);
    await start();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.cached).toBe(false);
    expect(results[0]?.fit.chance).toBe("medium");
    expect(await store.count()).toBe(1);
  });

  it("answers from the saved result the second time without calling the relay", async () => {
    const { start, results, fetchFn } = setup([reply]);
    await start();
    await start();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(results[1]?.cached).toBe(true);
    expect(results[1]?.fit).toEqual(results[0]?.fit);
  });

  it("runs again when forced, and the new result replaces the saved one", async () => {
    const { start, results, fetchFn, store } = setup([reply, reply]);
    await start();
    await start(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(results[1]?.cached).toBe(false);
    expect(await store.count()).toBe(1);
  });

  it("keeps the result on screen when saving it fails", async () => {
    const { start, results, store } = setup([reply]);
    vi.spyOn(store, "put").mockRejectedValue(new Error("quota"));
    await start();
    expect(results).toHaveLength(1);
  });

  it("does not save or report a result when the reply is unusable", async () => {
    const bad = () => sseResponse(relayStream(["not json"]));
    const { start, results, states, store } = setup([bad, bad]);
    await start();
    expect(results).toEqual([]);
    expect(states.at(-1)?.phase).toBe("raw");
    expect(await store.count()).toBe(0);
  });

  it("does not report a result when stopped while the saved result is being read", async () => {
    const { start, stop, results, fetchFn } = setup([reply]);
    const run = start();
    stop();
    await run;
    expect(results).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("lets a later start supersede an earlier forced one, showing only the saved result", async () => {
    const { start, results, store, fetchFn } = setup([reply]);
    await store.put(await fitKey(JD), {
      fit: JSON.parse(validFitReply()).fit,
      profile: { facts: [], stories: [] },
    });
    const forced = start(true);
    await start();
    await forced;
    expect(results).toHaveLength(1);
    expect(results[0]?.cached).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
