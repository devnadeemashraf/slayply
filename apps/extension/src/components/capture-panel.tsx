import { useEffect, useMemo, useState } from "react";
import type { CaptureKind, CaptureOutcome } from "../lib/capture.js";
import { captureFromActiveTab } from "../lib/capture-browser.js";
import type { JobFields } from "../lib/capture-fields.js";
import { createCaptureInbox, PENDING_CAPTURE_KEY } from "../lib/capture-inbox.js";
import { CaptureView, type Draft } from "./capture-view.js";

/** A captured piece of text for the generate panel; `seq` makes a repeat of the same text count as new. */
export type Incoming = { seq: number; field: "jd" | "question"; text: string };

const EMPTY_JOB: JobFields = { title: "", company: "", location: "", salary: "" };

export function CapturePanel({ onIncoming }: { onIncoming: (incoming: Incoming) => void }) {
  const inbox = useMemo(() => createCaptureInbox(chrome.storage.session), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobFields>(EMPTY_JOB);
  const [notes, setNotes] = useState("");
  const [paste, setPaste] = useState("");
  const [seq, setSeq] = useState(0);
  // Fields found by the last capture; applied to the job details only when the user uses a JD.
  const [found, setFound] = useState<JobFields>(EMPTY_JOB);

  function stage(outcome: CaptureOutcome) {
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setError(null);
    setDraft({ kind: outcome.capture.kind, text: outcome.capture.text, url: outcome.capture.url });
    setFound(outcome.capture.fields);
  }

  // Take what the context menu left, once on open and whenever the worker adds another.
  useEffect(() => {
    const takeNow = () =>
      void inbox.take().then(
        (outcome) => outcome && stage(outcome),
        () => {},
      );
    takeNow();
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (area === "session" && PENDING_CAPTURE_KEY in changes) takeNow();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, [inbox]);

  async function capture(mode: "selection" | "page") {
    setBusy(true);
    try {
      stage(await captureFromActiveTab(mode));
    } catch {
      setError("Slayply could not read the page.");
    } finally {
      setBusy(false);
    }
  }

  function use() {
    if (!draft) return;
    if (draft.kind === "note") {
      setNotes((current) => (current === "" ? draft.text : `${current}\n\n${draft.text}`));
    } else {
      onIncoming({
        seq: seq + 1,
        field: draft.kind === "jd" ? "jd" : "question",
        text: draft.text,
      });
      setSeq(seq + 1);
    }
    if (draft.kind === "jd") {
      // Only fill what was found; a blank never overwrites what the user already typed.
      setJob((current) => ({
        title: found.title || current.title,
        company: found.company || current.company,
        location: found.location || current.location,
        salary: found.salary || current.salary,
      }));
    }
    setDraft(null);
  }

  return (
    <CaptureView
      draft={draft}
      error={error}
      busy={busy}
      job={job}
      notes={notes}
      paste={paste}
      onCaptureSelection={() => void capture("selection")}
      onCapturePage={() => void capture("page")}
      onDraftKind={(kind: CaptureKind) => setDraft((d) => d && { ...d, kind })}
      onDraftText={(text) => setDraft((d) => d && { ...d, text })}
      onUse={use}
      onDiscard={() => setDraft(null)}
      onJobChange={(field, value) => setJob((current) => ({ ...current, [field]: value }))}
      onNotesChange={setNotes}
      onPasteChange={setPaste}
      onPasteAdd={() => {
        setError(null);
        setDraft({ kind: "jd", text: paste.trim(), url: "" });
        setFound(EMPTY_JOB);
        setPaste("");
      }}
    />
  );
}
