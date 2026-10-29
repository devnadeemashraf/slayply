import { useEffect, useMemo, useRef, useState } from "react";
import type { Capture, CaptureKind, CaptureOutcome } from "../lib/capture.js";
import { captureOneClickFromActiveTab } from "../lib/capture-browser.js";
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
  const seq = useRef(0);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  /** Puts a capture where it belongs at once; the user reviews it in the boxes it lands in. */
  function apply(capture: Pick<Capture, "kind" | "text"> & { fields: JobFields }) {
    setError(null);
    if (capture.kind === "note") {
      setNotes((current) => (current === "" ? capture.text : `${current}\n\n${capture.text}`));
      return;
    }
    seq.current += 1;
    onIncomingRef.current({
      seq: seq.current,
      field: capture.kind === "jd" ? "jd" : "question",
      text: capture.text,
    });
    if (capture.kind === "jd") {
      // Only fill what was found; a blank never overwrites what the user already typed.
      setJob((current) => ({
        title: capture.fields.title || current.title,
        company: capture.fields.company || current.company,
        location: capture.fields.location || current.location,
        salary: capture.fields.salary || current.salary,
      }));
    }
  }

  function receive(outcome: CaptureOutcome) {
    if (outcome.ok) apply(outcome.capture);
    else setError(outcome.message);
  }

  // Take what the icon or the context menu left, once on open and whenever the worker adds another.
  useEffect(() => {
    const takeNow = () =>
      void inbox.take().then(
        (outcome) => outcome && receive(outcome),
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

  async function capture() {
    setBusy(true);
    try {
      receive(await captureOneClickFromActiveTab());
    } catch {
      setError("Slayply could not read the page.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CaptureView
      draft={draft}
      error={error}
      busy={busy}
      job={job}
      notes={notes}
      paste={paste}
      onCapture={() => void capture()}
      onDraftKind={(kind: CaptureKind) => setDraft((d) => d && { ...d, kind })}
      onDraftText={(text) => setDraft((d) => d && { ...d, text })}
      onUse={() => {
        if (draft) apply({ kind: draft.kind, text: draft.text, fields: EMPTY_JOB });
        setDraft(null);
      }}
      onDiscard={() => setDraft(null)}
      onJobChange={(field, value) => setJob((current) => ({ ...current, [field]: value }))}
      onNotesChange={setNotes}
      onPasteChange={setPaste}
      onPasteAdd={() => {
        setError(null);
        setDraft({ kind: "jd", text: paste.trim(), url: "" });
        setPaste("");
      }}
    />
  );
}
