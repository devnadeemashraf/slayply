import {
  type JobRecord,
  type Length,
  LIMITS,
  type StoredProfile,
  type StoredResume,
  suggestResume,
  type Tone,
} from "@slayply/core";
import { Button } from "@slayply/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildAnswerRequest,
  buildDraftRequest,
  buildFitRequest,
  describeProfileUse,
  type JobDetails,
  type ProviderChoice,
} from "../lib/build-request.js";
import { RELAY_URL } from "../lib/config.js";
import { type DraftKindId, draftKind, shiftLength } from "../lib/draft-kinds.js";
import { type CopyState, createCopyFeedback } from "../lib/copy.js";
import { createFitRunner } from "../lib/fit-flow.js";
import { type FitStore, fitKey } from "../lib/fit-store.js";
import {
  copyTextOf,
  createGenerationRunner,
  type GenerationState,
} from "../lib/generate-controller.js";
import { applyIncoming, type Incoming } from "../lib/incoming.js";
import { findPastAnswers } from "../lib/past-answers.js";
import { buildJobDraft } from "../lib/job-draft.js";
import type { JobStore } from "../lib/job-store.js";
import { DraftControls } from "./draft-controls.js";
import { jobSteps, primaryAction } from "../lib/job-steps.js";
import {
  addRow,
  highestId,
  type QuestionRow,
  removeRow,
  rowsToQuestions,
  updateRow,
} from "../lib/question-rows.js";
import { REMEMBERED_RESUME_KEY } from "../lib/storage-keys.js";
import { ActionBar } from "./action-bar.js";
import { JobEmpty } from "./empty-states.js";
import { type FitResult, FitView } from "./fit-view.js";
import { GenerationView } from "./generation-view.js";
import { JobStepper } from "./job-stepper.js";
import { QuestionList } from "./question-list.js";

const JD_MAX_CHARS = 60_000;
const DIRECT_BLOCKED =
  "Direct Mode works with Claude only. Turn it off in Setup, or switch the provider to Claude from the chip at the top.";

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
  choice,
  direct,
  profile,
  resumes,
  fitStore,
  jobStore,
  onJobSaved,
  incoming,
  job,
}: {
  apiKey: string;
  choice: ProviderChoice;
  direct: boolean;
  profile: StoredProfile | null;
  resumes: readonly StoredResume[];
  fitStore: FitStore;
  jobStore: JobStore;
  onJobSaved: () => void;
  incoming: Incoming | null;
  job: JobDetails;
}) {
  const [jd, setJd] = useState("");
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [jdOpen, setJdOpen] = useState(true);
  const [resumeId, setResumeId] = useState(readRememberedResume);
  const [formError, setFormError] = useState<string | null>(null);
  const [state, setState] = useState<GenerationState>({ phase: "idle" });
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const runner = useMemo(() => createGenerationRunner(setState), []);
  const [fitState, setFitState] = useState<GenerationState>({ phase: "idle" });
  const [fitResult, setFitResult] = useState<FitResult | null>(null);
  const [kind, setKind] = useState<DraftKindId>("answers");
  const [tone, setTone] = useState<Tone>("crisp");
  const [length, setLength] = useState<Length>("medium");
  const [draftLimit, setDraftLimit] = useState("");
  // What produced the current result, so Shorter / Longer never rerun a different kind.
  const [resultKind, setResultKind] = useState<DraftKindId>("answers");
  const [savedJobs, setSavedJobs] = useState<JobRecord[]>([]);
  const [jobKey, setJobKey] = useState("");
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const fitRunner = useMemo(
    () => createFitRunner({ store: fitStore, onState: setFitState, onResult: setFitResult }),
    [fitStore],
  );
  const stopAll = useCallback(() => {
    runner.stop();
    fitRunner.stop();
  }, [runner, fitRunner]);

  // Ids already handed out, so a removed question's id (and its stale edit) is never reused.
  const idFloor = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const changeRows = (change: (rows: QuestionRow[], floor: number) => QuestionRow[]) =>
    setRows((current) => {
      const next = change(current, idFloor.current);
      idFloor.current = Math.max(idFloor.current, highestId(next));
      return next;
    });

  // A capture lands once: a remount must not overwrite what the user has edited since. A new job
  // description also drops the old fit result, answers and edits, which no longer match it.
  const appliedSeq = useRef(0);
  useEffect(() => {
    if (!incoming || incoming.seq <= appliedSeq.current) return;
    appliedSeq.current = incoming.seq;
    const applied = applyIncoming(incoming, rowsRef.current, idFloor.current);
    idFloor.current = Math.max(idFloor.current, highestId(applied.rows));
    setRows(applied.rows);
    if (applied.jd !== undefined) setJd(applied.jd);
    if (applied.resetResult) {
      setJdOpen(false);
      runner.stop();
      fitRunner.stop();
      setFitResult(null);
      setFitState({ phase: "idle" });
      setState({ phase: "idle" });
      setEdits({});
      setCopyState("idle");
    }
  }, [incoming, runner, fitRunner]);

  // A save note describes the text at the time of the click, so any later change clears it.
  useEffect(() => setSaveNote(null), [jd, edits, state]);

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
  const directBlocked = direct && choice.provider !== "anthropic";
  // Direct Mode uses the newest Claude model, so a model or effort saved earlier is not sent.
  const requestChoice: ProviderChoice = direct ? { ...choice, model: "", effort: "" } : choice;
  const running = state.phase === "streaming";
  const fitRunning = fitState.phase === "streaming";
  const suggested = fitResult ? suggestResume(fitResult.fit.resume, resumes) : null;
  const progress = {
    hasJd: jd.trim() !== "",
    fitDone: fitResult !== null,
    answered: state.phase === "done" || state.phase === "raw",
    fitRunning,
    running,
  };
  const action = primaryAction({
    ...progress,
    questionCount: kind === "answers" ? rows.filter((row) => row.checked).length : 1,
  });
  const limits: Record<string, number> = {};
  const draftMax = Number(draftLimit.trim());
  const limitOk = Number.isInteger(draftMax) && draftMax > 0 && draftMax <= LIMITS.questionMaxChars;
  if (kind !== "answers" && limitOk) {
    limits[draftKind(kind).task === "answers" ? kind : draftKind(kind).task] = draftMax;
  }
  for (const row of rows) {
    if (typeof row.maxChars === "number" && row.maxChars > 0) limits[row.id] = row.maxChars;
  }

  async function slay(onlyId?: string, style = { tone, length }) {
    if (kind !== "answers" && draftLimit.trim() !== "" && !limitOk) {
      setFormError(
        `The character limit must be a whole number from 1 to ${LIMITS.questionMaxChars.toLocaleString("en-US")}.`,
      );
      return;
    }
    const common = { jd, job, profile, resume, choice: requestChoice, style };
    const built =
      kind === "answers"
        ? buildAnswerRequest({ ...common, questions: rowsToQuestions(rows, onlyId) })
        : buildDraftRequest({
            ...common,
            kind,
            ...(draftLimit.trim() === "" ? {} : { maxChars: draftMax }),
          });
    if (!built.ok || directBlocked) {
      setFormError(built.ok ? DIRECT_BLOCKED : built.message);
      return;
    }
    setFormError(null);
    setCopyState("idle");
    setEdits({});
    setResultKind(kind);
    await runner.start({
      baseUrl: RELAY_URL,
      apiKey,
      direct,
      request: built.request,
      fetchFn: (url, init) => fetch(url, init),
    });
  }

  function applyEdit(outputId: string, text: string) {
    setEdits((current) => ({ ...current, [outputId]: text }));
    setCopyState("idle");
  }

  // Saved jobs feed the "earlier answer" hints; they load once and again after each save.
  const loadJobs = useCallback(
    () => jobStore.list().then(setSavedJobs, () => setSavedJobs([])),
    [jobStore],
  );
  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);
  useEffect(() => {
    let current = true;
    fitKey(jd).then(
      (key) => current && setJobKey(key),
      () => current && setJobKey(""),
    );
    return () => {
      current = false;
    };
  }, [jd]);

  const pastByRow = useMemo(
    () =>
      new Map(rows.map((row) => [row.id, findPastAnswers(row.text, savedJobs, jobKey)] as const)),
    [rows, savedJobs, jobKey],
  );

  async function saveJob() {
    try {
      await jobStore.save(
        await fitKey(jd),
        buildJobDraft({ job, jd, resumeName: resume?.name ?? "", rows, state, edits }),
      );
      onJobSaved();
      void loadJobs();
      setSaveNote("Saved to Jobs.");
    } catch {
      setSaveNote("The job could not be saved.");
    }
  }

  async function checkFit(force: boolean) {
    const built = buildFitRequest({ jd, job, profile, resume, choice: requestChoice });
    if (!built.ok || directBlocked) {
      setFormError(built.ok ? DIRECT_BLOCKED : built.message);
      return;
    }
    setFormError(null);
    setFitResult(null);
    await fitRunner.start({
      jd,
      force,
      baseUrl: RELAY_URL,
      apiKey,
      direct,
      request: built.request,
      fetchFn: (url, init) => fetch(url, init),
    });
  }

  return (
    <section>
      <h2>Draft an answer</h2>
      <JobStepper steps={jobSteps(progress)} />
      {!progress.hasJd && rows.length === 0 && state.phase === "idle" && <JobEmpty />}
      <p className="muted">{describeProfileUse(profile, resume)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
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
        <details open={jdOpen} onToggle={(event) => setJdOpen(event.currentTarget.open)}>
          <summary>{`Job description (${jd.length.toLocaleString("en-US")} characters)`}</summary>
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
        </details>
        <DraftControls
          kind={kind}
          tone={tone}
          length={length}
          maxChars={draftLimit}
          canResize={
            state.phase === "done" && !running && resultKind === kind && kind !== "answers"
          }
          onKind={setKind}
          onTone={setTone}
          onLength={setLength}
          onMaxChars={setDraftLimit}
          onResize={(direction) => {
            const next = shiftLength(length, direction);
            setLength(next);
            void slay(undefined, { tone, length: next });
          }}
        />
        {kind === "answers" && (
          <QuestionList
            rows={rows}
            running={running}
            onChange={(id, patch) => changeRows((current) => updateRow(current, id, patch))}
            onRemove={(id) => changeRows((current) => removeRow(current, id))}
            onAdd={() => changeRows((current, floor) => addRow(current, "", floor))}
            onGenerateOne={(id) => void slay(id)}
            onGenerateAll={() => void slay()}
            pastFor={(id) => pastByRow.get(id) ?? []}
            onUsePast={(text) => navigator.clipboard.writeText(text)}
          />
        )}
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
        onCancel={stopAll}
        direct={direct}
      />
      <GenerationView
        state={state}
        copyState={copyState}
        edits={edits}
        limits={limits}
        onEdit={applyEdit}
        onFit={applyEdit}
        onRetry={() => void slay()}
        onCancel={stopAll}
        direct={direct}
        onCopy={() => {
          const text = copyTextOf(state, edits);
          if (text !== null) void feedback.copy(text);
        }}
      />
      <Button variant="secondary" disabled={!progress.hasJd} onClick={() => void saveJob()}>
        Save job
      </Button>
      {saveNote && (
        <p className="muted" role="status">
          {saveNote}
        </p>
      )}
      <ActionBar
        action={action}
        onFit={() => void checkFit(false)}
        onAnswers={() => void slay()}
        onStop={stopAll}
      />
    </section>
  );
}
