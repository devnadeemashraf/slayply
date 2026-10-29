import type { StoredProfile } from "@slayply/core";
import { useEffect, useMemo, useState } from "react";
import { buildAnswerRequest, describeProfileUse } from "../lib/build-request.js";
import { type CopyState, createCopyFeedback } from "../lib/copy.js";
import { RELAY_URL } from "../lib/config.js";
import {
  copyTextOf,
  createGenerationRunner,
  type GenerationState,
} from "../lib/generate-controller.js";
import { GenerationView } from "./generation-view.js";

const JD_MAX_CHARS = 60_000;
const QUESTION_MAX_CHARS = 5_000;

export function GeneratePanel({
  apiKey,
  profile,
}: {
  apiKey: string;
  profile: StoredProfile | null;
}) {
  const [jd, setJd] = useState("");
  const [question, setQuestion] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<GenerationState>({ phase: "idle" });
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const runner = useMemo(() => createGenerationRunner(setState), []);

  const feedback = useMemo(() => createCopyFeedback(navigator.clipboard, setCopyState), []);

  // Leaving the panel cancels a running generation and any pending "Copied!" reset.
  useEffect(
    () => () => {
      runner.stop();
      feedback.cancel();
    },
    [runner, feedback],
  );

  const running = state.phase === "streaming";

  async function slay() {
    const built = buildAnswerRequest({ jd, question, profile });
    if (!built.ok) {
      setFormError(built.message);
      return;
    }
    setFormError(null);
    setCopyState("idle");
    await runner.start({
      baseUrl: RELAY_URL,
      apiKey,
      request: built.request,
      fetchFn: (url, init) => fetch(url, init),
    });
  }

  return (
    <section>
      <h2>Draft an answer</h2>
      <p className="muted">{describeProfileUse(profile)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void slay();
        }}
      >
        <label htmlFor="jd">Job description</label>
        <textarea
          id="jd"
          rows={6}
          maxLength={JD_MAX_CHARS}
          value={jd}
          onChange={(event) => setJd(event.target.value)}
        />
        <label htmlFor="question">Question</label>
        <textarea
          id="question"
          rows={3}
          maxLength={QUESTION_MAX_CHARS}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <div className="row">
          <button type="submit" disabled={running || jd.trim() === "" || question.trim() === ""}>
            Slay
          </button>
          {running && (
            <button type="button" className="secondary" onClick={() => runner.stop()}>
              Stop
            </button>
          )}
        </div>
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
      </form>
      <GenerationView
        state={state}
        copyState={copyState}
        onCopy={() => {
          const text = copyTextOf(state);
          if (text !== null) void feedback.copy(text);
        }}
      />
    </section>
  );
}
