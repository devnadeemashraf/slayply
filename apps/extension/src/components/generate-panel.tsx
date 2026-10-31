import { Button } from "@slayply/ui";
import { describeProfileUse } from "../lib/build-request.js";
import { shiftLength } from "../lib/draft-kinds.js";
import { copyTextOf } from "../lib/generate-controller.js";
import { screenSteps } from "../lib/job-screens.js";
import { addRow, removeRow, updateRow } from "../lib/question-rows.js";
import { styleSummary } from "../lib/style-summary.js";
import { ActionBar } from "./action-bar.js";
import { DraftControls } from "./draft-controls.js";
import { JobEmpty } from "./empty-states.js";
import { FitView } from "./fit-view.js";
import { GenerationView } from "./generation-view.js";
import { JobStepper } from "./job-stepper.js";
import { JobTextRow } from "./job-text-row.js";
import { QuestionList } from "./question-list.js";
import {
  JD_MAX_CHARS,
  type JobControllerProps,
  rememberResume,
  useJobController,
} from "./use-job-controller.js";

export function GeneratePanel(props: JobControllerProps) {
  const { profile, resumes, direct } = props;
  const {
    action,
    applyEdit,
    changeRows,
    checkFit,
    copyState,
    draftLimit,
    edits,
    feedback,
    fitResult,
    fitRunner,
    fitState,
    formError,
    jd,
    kind,
    length,
    limits,
    pastByRow,
    progress,
    screen,
    screenProgress,
    selectScreen,
    resultKind,
    resume,
    rows,
    running,
    saveJob,
    saveNote,
    setDraftLimit,
    setFitResult,
    setFitState,
    setJd,
    setKind,
    setLength,
    setResumeId,
    setTone,
    slay,
    state,
    stopAll,
    suggested,
    tone,
  } = useJobController(props);

  // The character limit field sits in the collapsed Style section; its error opens it.
  const limitError = formError?.startsWith("The character limit") === true;

  return (
    <section>
      <h2>Draft an answer</h2>
      <JobStepper steps={screenSteps(screen, screenProgress)} onSelect={selectScreen} />
      {!progress.hasJd && rows.length === 0 && state.phase === "idle" && <JobEmpty />}
      <p className="muted">{describeProfileUse(profile, resume)}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        {screen === "capture" && (
          <>
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
            <JobTextRow
              jd={jd}
              max={JD_MAX_CHARS}
              onChange={(text) => {
                setJd(text);
                fitRunner.stop();
                setFitResult(null);
                setFitState({ phase: "idle" });
              }}
            />
          </>
        )}
        {screen === "questions" && (
          <>
            <details className="style-section" open={limitError ? true : undefined}>
              <summary>{`Style: ${styleSummary(kind, tone, length)}`}</summary>
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
            </details>
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
          </>
        )}
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
      </form>
      {screen === "capture" && (
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
          compact
        />
      )}
      {screen === "answers" && (
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
      )}
      {screen !== "capture" && (
        <>
          <Button variant="secondary" disabled={!progress.hasJd} onClick={() => void saveJob()}>
            Save job
          </Button>
          {saveNote && (
            <p className="muted" role="status">
              {saveNote}
            </p>
          )}
        </>
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
