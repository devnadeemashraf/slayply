import type { FitResult } from "../components/fit-view.js";
import type { FitStore } from "./fit-store.js";
import { fitKey } from "./fit-store.js";
import {
  createGenerationRunner,
  type GenerationState,
  type RunGenerationOptions,
} from "./generate-controller.js";

export type StartFitOptions = Omit<RunGenerationOptions, "signal" | "onState"> & {
  /** The job description the request was built from; it keys the saved result. */
  jd: string;
  /** Skip the saved result and ask the model again. */
  force: boolean;
};

/**
 * Runs a fit check once per job (SPEC Feature 4). A saved result answers without a model call;
 * a new result is saved after it validates. A save that fails never hides the result.
 */
export function createFitRunner(handlers: {
  store: FitStore;
  onState: (state: GenerationState) => void;
  onResult: (result: FitResult) => void;
}) {
  const { store, onState, onResult } = handlers;
  // Bumped on every start and stop so a slow cache read cannot overwrite a newer run.
  let latest = 0;

  // Set before each run; only the newest run may report, so this is the key of the run reporting.
  let startedKey = "";

  const runner = createGenerationRunner((state) => {
    onState(state);
    if (state.phase !== "done" || state.response.fit === undefined) return;
    const result = { fit: state.response.fit, profile: state.profile, cached: false };
    onResult(result);
    store.put(startedKey, { fit: result.fit, profile: result.profile }).catch(() => {
      // Not saved; the result is still shown and the next check simply runs again.
    });
  });

  return {
    async start({ jd, force, ...options }: StartFitOptions): Promise<void> {
      const run = ++latest;
      // A run still streaming for another job must not report over this one.
      runner.stop();
      const key = await fitKey(jd);
      if (!force) {
        const hit = await store.get(key).catch(() => null);
        if (run !== latest) return;
        if (hit) {
          onState({ phase: "idle" });
          onResult({ ...hit, cached: true });
          return;
        }
      }
      if (run !== latest) return;
      startedKey = key;
      await runner.start(options);
    },
    stop(): void {
      latest++;
      runner.stop();
    },
  };
}
