import { type StoredProfile, type StoredResume, suggestResume } from "@slayply/core";
import { useEffect, useMemo, useState } from "react";
import { REMEMBERED_RESUME_KEY } from "../lib/storage-keys.js";
import { buildAnswerRequest, buildFitRequest, describeProfileUse } from "../lib/build-request.js";
import { RELAY_URL } from "../lib/config.js";
import { type CopyState, createCopyFeedback } from "../lib/copy.js";
import { createFitRunner } from "../lib/fit-flow.js";
import type { FitStore } from "../lib/fit-store.js";
import {
  copyTextOf,
  createGenerationRunner,
  type GenerationState,
} from "../lib/generate-controller.js";
import { type FitResult, FitView } from "./fit-view.js";
import { GenerationView } from "./generation-view.js";

const JD_MAX_CHARS = 60_000;
const QUESTION_MAX_CHARS = 5_000;

// A per-viewer convenience only; storage can be blocked, so a failure just forgets the choice.
function readRememberedResume(): string {
  try {
    return localStorage.getItem(REMEMBERED_RESUME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberResume(id: string): void {
  try {
    localStorage.setItem(REMEMBERED_RESUME_KEY, id);
  } catch {
    // Not remembered; the select still works for this session.
  }
}

export function GeneratePanel({
  apiKey,
  profile,
  resumes,
  fitStore,
}: {
  apiKey: string;
  profile: StoredProfile | null;
  resumes: readonly StoredResume[];
  fitStore: FitStore;
}) {
  const [jd, setJd] = useState("");
  const [question, setQuestion] = useState("");
  const [resumeId, setResumeId] = useState(readRememberedResume);
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<GenerationState>({ phase: "idle" });
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const runner = useMemo(() => createGenerationRunner(setState), []);
  const [fitState, setFitState] = useState<GenerationState>({ phase: "idle" });
  const [fitResult, setFitResult] = useState<FitResult | null>(null);
  const fitRunner = useMemo(
    () => createFitRunner({ store: fitStore, onState: setFitState, onResult: setFitResult }),
    [fitStore],
  );

  const feedback = useMemo(() => createCopyFeedback(navigator.clipboard, setCopyState), []);

  // Leaving the panel cancels a running generation and any pending "Copied!" reset.
  useEffect(
    () => () => {
      runner.stop();
      fitRunner.stop();
      feedback.cancel();
    },
    [runner, fitRunner, feedback],
  );

  // A removed resume falls back to "No resume" instead of silently sending nothing for a dead ID.
  const resume = resumes.find((entry) => entry.id === resumeId) ?? null;
  const running = state.phase === "streaming";
  const fitRunning = fitState.phase === "streaming";
  const suggested = fitResult ? suggestResume(fitResult.fit.resume, resumes) : null;

  async function slay() {
    const built = buildAnswerRequest({ jd, question, profile, resume });
    if (!built.ok) {
      setFormError(built.message);
      return;
    }
    setFormError(null);
    setCopyState("idle");
    setEdits({});
    await runner.start({
      baseUrl: RELAY_URL,
      apiKey,
      request: built.request,
      fetchFn: (url, init) => fetch(url, init),
    });
  }

  async function checkFit(force: boolean) {
    const built = buildFitRequest({ jd, profile, resume });
    if (!built.ok) {
      setFormError(built.message);
      return;
    }
    setFormError(null);
    setFitResult(null);
    await fitRunner.start({
      jd,
      force,
      baseUrl: RELAY_URL,
      apiKey,
      request: built.request,
      fetchFn: (url, init) => fetch(url, init),
    });
  }

  return (
    <section>
      <h2>Draft an answer</h2>
      <p className="muted">{describeProfileUse(profile, resume)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void slay();
        }}
      >
        <label htmlFor="resume">Resume</label>
        <select
          id="resume"
          value={resume?.id ?? ""}
          onChange={(event) => {
            setResumeId(event.target.value);
            rememberResume(event.target.value);
          }}
        >
          <option value="">No resume</option>
          {resumes.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.track}, {entry.region})
            </option>
          ))}
        </select>
        <label htmlFor="jd">Job description</label>
        <textarea
          id="jd"
          rows={6}
          maxLength={JD_MAX_CHARS}
          value={jd}
          onChange={(event) => {
            setJd(event.target.value);
            fitRunner.stop();
            setFitResult(null);
            setFitState({ phase: "idle" });
          }}
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
          <button
            type="button"
            className="secondary"
            disabled={fitRunning || jd.trim() === ""}
            onClick={() => void checkFit(false)}
          >
            Check fit
          </button>
          {fitRunning && (
            <button type="button" className="secondary" onClick={() => fitRunner.stop()}>
              Stop
            </button>
          )}
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
      <FitView
        state={fitState}
        result={fitResult}
        suggestion={suggested ? { resume: suggested, active: suggested.id === resume?.id } : null}
        onUseResume={() => {
          if (!suggested) return;
          setResumeId(suggested.id);
          rememberResume(suggested.id);
        }}
        onRerun={() => void checkFit(true)}
      />
      <GenerationView
        state={state}
        copyState={copyState}
        edits={edits}
        onEdit={(outputId, text) => {
          setEdits((current) => ({ ...current, [outputId]: text }));
          setCopyState("idle");
        }}
        onCopy={() => {
          const text = copyTextOf(state, edits);
          if (text !== null) void feedback.copy(text);
        }}
      />
    </section>
  );
}
