import { useEffect, useMemo, useRef, useState } from "react";
import type { Capture, CaptureKind, CaptureOutcome } from "../lib/capture.js";
import { captureOneClickFromActiveTab } from "../lib/capture-browser.js";
import type { JobFields } from "../lib/capture-fields.js";
import { createCaptureInbox, PENDING_CAPTURE_KEY } from "../lib/capture-inbox.js";
import type { Incoming } from "../lib/incoming.js";
import type { DetectedQuestion } from "../lib/page-snapshot.js";
import { CaptureView, type Draft } from "./capture-view.js";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

const EMPTY_JOB: JobFields = { title: "", company: "", location: "", salary: "" };

export function CapturePanel({
  onIncoming,
  job,
  onJobChange,
}: {
  onIncoming: (incoming: Incoming) => void;
  job: JobFields;
  onJobChange: (update: (current: JobFields) => JobFields) => void;
}) {
  const inbox = useMemo(() => createCaptureInbox(chrome.storage.session), []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [paste, setPaste] = useState("");
  const seq = useRef(0);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  /** Puts a capture where it belongs at once; the user reviews it in the boxes it lands in. */
  function apply(
    capture: Pick<Capture, "kind" | "text" | "fromPage"> & {
      fields: JobFields;
      questions: DetectedQuestion[];
    },
  ) {
    setError(null);
    if (capture.kind === "note") {
      setNotes((current) => (current === "" ? capture.text : `${current}\n\n${capture.text}`));
      return;
    }
    const send = (incoming: DistributiveOmit<Incoming, "seq">) => {
      seq.current += 1;
      onIncomingRef.current({ ...incoming, seq: seq.current } as Incoming);
    };
    if (capture.kind === "question") {
      send({ kind: "question", text: capture.text });
      return;
    }
    // One update per capture: React batches state updates, so two would lose the first.
    send({
      kind: "jd",
      text: capture.text,
      replaceAll: capture.fromPage === true,
      detected: capture.questions,
    });
    if (capture.fromPage === true) {
      // A whole new page is a new job: its details replace the old ones.
      onJobChange(() => capture.fields);
    } else {
      // A selection fills only what it found; a blank never overwrites what the user typed.
      onJobChange((current) => ({
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
        if (draft) apply({ kind: draft.kind, text: draft.text, fields: EMPTY_JOB, questions: [] });
        setDraft(null);
      }}
      onDiscard={() => setDraft(null)}
      onJobChange={(field, value) => onJobChange((current) => ({ ...current, [field]: value }))}
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
