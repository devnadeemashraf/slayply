import {
  type ContextAnswers,
  compileAnswers,
  emptyAnswers,
  publicAnswers,
  QUESTIONNAIRE,
  renderContextPack,
} from "@slayply/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnswersCorruptError, type AnswersStore } from "../lib/answers-store.js";
import { downloadText } from "../lib/download.js";
import { createDraftSaver, type SaveOutcome } from "../lib/draft-saver.js";
import {
  addEntry,
  addGroupItem,
  exportAnswersJson,
  moveEntry,
  type Path,
  parseAnswersImport,
  removeEntry,
  removeGroupItem,
  sectionProgress,
  setAnswer,
  validateAnswers,
} from "../lib/questionnaire-state.js";
import { type FormHandlers, SectionForm, StepNav } from "./questionnaire-view.js";

const MAX_FILE_BYTES = 1_000_000;
const AUTOSAVE_MS = 1500;

type Loaded = "loading" | "ready" | "corrupt" | "error";

function describeSave(outcome: SaveOutcome | null, busy: boolean): string {
  if (busy) return "Saving…";
  if (!outcome) return "";
  switch (outcome.status) {
    case "saved":
      return "Saved on this device.";
    case "unchanged":
      return "All changes saved.";
    case "invalid":
      return "Not saved yet: fix the highlighted fields.";
    case "partial":
      return `Saved, except ${outcome.dropped.length} field${outcome.dropped.length === 1 ? "" : "s"} that need fixing (sections marked with ! in the list).`;
    case "stale":
    case "error":
      return outcome.message;
  }
}

export function QuestionnairePanel({
  store,
  onProfileChanged,
}: {
  store: AnswersStore;
  /** Called after answers were applied or discarded, so the profile on screen is reloaded. */
  onProfileChanged: () => void;
}) {
  const saver = useMemo(() => createDraftSaver(store), [store]);
  const [loaded, setLoaded] = useState<Loaded>("loading");
  const [answers, setAnswers] = useState<ContextAnswers>(emptyAnswers());
  const latest = useRef(answers);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<{
    answers: ContextAnswers;
    summary: string;
  } | null>(null);

  useEffect(() => {
    store.load().then(
      (stored) => {
        const start = stored ?? emptyAnswers();
        saver.init(start);
        latest.current = start;
        setAnswers(start);
        setLoaded("ready");
      },
      (error: unknown) => setLoaded(error instanceof AnswersCorruptError ? "corrupt" : "error"),
    );
  }, [store, saver]);

  const errors = useMemo(() => validateAnswers(answers), [answers]);
  const progress = useMemo(() => sectionProgress(answers, errors), [answers, errors]);

  function update(next: ContextAnswers) {
    latest.current = next;
    setAnswers(next);
  }

  async function save(): Promise<void> {
    setBusy(true);
    const result = await saver.save(latest.current);
    setBusy(false);
    setOutcome(result);
  }

  // Save shortly after typing stops, so closing the panel does not lose the last edit.
  useEffect(() => {
    if (loaded !== "ready") return;
    const timer = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [answers, loaded]);

  // Save when the panel is hidden or closed, not only after the typing pause.
  useEffect(() => {
    if (loaded !== "ready") return;
    const flush = () => void saver.save(latest.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [loaded, saver]);

  const handlers: FormHandlers = {
    onChange: (path: Path, value: unknown) => update(setAnswer(latest.current, path, value)),
    onBlur: () => void save(),
    onAddEntry: () => {
      update(addEntry(latest.current, QUESTIONNAIRE[step]?.id ?? "profile"));
      void save();
    },
    onRemoveEntry: (index) => {
      update(removeEntry(latest.current, QUESTIONNAIRE[step]?.id ?? "profile", index));
      void save();
    },
    onMoveEntry: (index, delta) => {
      update(moveEntry(latest.current, QUESTIONNAIRE[step]?.id ?? "profile", index, delta));
      void save();
    },
    onAddGroupItem: (path, max) => update(addGroupItem(latest.current, path, max)),
    onRemoveGroupItem: (path, index) => {
      update(removeGroupItem(latest.current, path, index));
      void save();
    },
  };

  async function apply() {
    setBusy(true);
    setMessage(null);
    const result = await saver.apply(latest.current);
    setBusy(false);
    if (result.status === "applied") {
      setWarnings(result.warnings);
      setMessage("Your answers are now part of your profile.");
      setOutcome({ status: "saved" });
      onProfileChanged();
    } else if (result.status === "invalid") {
      setOutcome(result);
    } else {
      setMessage(result.message);
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setMessage("That file is too large (limit 1 MB).");
      return;
    }
    const result = parseAnswersImport(await file.text(), latest.current);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage(null);
    setImportPreview(result);
  }

  async function discard() {
    try {
      await store.discard();
      saver.init(emptyAnswers());
      update(emptyAnswers());
      setLoaded("ready");
      onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not discard the answers.");
    }
  }

  if (loaded === "loading") return null;
  if (loaded === "error") {
    return (
      <p className="error" role="alert">
        Could not open the saved questionnaire answers. Reload the panel to try again.
      </p>
    );
  }
  if (loaded === "corrupt") {
    return (
      <section>
        <h2>Questionnaire</h2>
        <p className="error" role="alert">
          Your saved answers could not be read. Discarding them also removes the facts built from
          them; anything you imported or typed by hand stays.
        </p>
        <button type="button" onClick={() => void discard()}>
          Discard the unreadable answers
        </button>
      </section>
    );
  }

  const section = QUESTIONNAIRE[step];
  const saveText = describeSave(outcome, busy);

  return (
    <section>
      <h2>Questionnaire</h2>
      <p className="muted">
        Answer once; Slayply reuses it to personalize every answer. Everything is saved on this
        device as you type.
      </p>
      <button type="button" className="secondary" onClick={() => setOpen(!open)}>
        {open ? "Hide questionnaire" : "Open questionnaire"}
      </button>
      {open && section && (
        <>
          <StepNav
            progress={progress}
            current={step}
            onSelect={(index) => {
              void save();
              setStep(index);
            }}
          />
          <SectionForm section={section} answers={answers} errors={errors} handlers={handlers} />
          <p className="muted" role="status">
            {saveText}
          </p>
          <div className="row">
            <button type="button" onClick={() => void apply()} disabled={busy}>
              Use these answers
            </button>
          </div>
          <p className="muted">
            "Use these answers" turns what you wrote into facts, stories and preferences you can
            cite. Do this after you finish a section; you can come back and change it any time.
          </p>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          {warnings.length > 0 && (
            <>
              <p className="muted">{warnings.length} things to check:</p>
              <ul className="warnings">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </>
          )}
          <h3>Backup and share</h3>
          <div className="row">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                downloadText(
                  "slayply-answers.json",
                  exportAnswersJson(latest.current),
                  "application/json",
                )
              }
            >
              Export answers (JSON)
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                downloadText(
                  "slayply-context.md",
                  renderContextPack(compileAnswers(publicAnswers(latest.current))),
                  "text/markdown",
                )
              }
            >
              Export context pack (.md)
            </button>
          </div>
          <p className="muted">
            The answers file includes your private details, because it is your own backup. The
            context pack does not.
          </p>
          <label htmlFor="answers-file">Import an answers file (.json)</label>
          <input
            id="answers-file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void chooseFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {importPreview && (
            <div className="result">
              <p>This file has {importPreview.summary} Importing replaces the answers on screen.</p>
              <div className="row">
                <button
                  type="button"
                  onClick={() => {
                    // The form stayed editable while the preview was open: use today's counter.
                    update({
                      ...importPreview.answers,
                      nextEntry: Math.max(
                        importPreview.answers.nextEntry,
                        latest.current.nextEntry,
                      ),
                    });
                    setImportPreview(null);
                    void save();
                  }}
                >
                  Replace my answers
                </button>
                <button type="button" className="secondary" onClick={() => setImportPreview(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
