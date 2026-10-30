import { useEffect, useMemo, useRef, useState } from "react";
import type { Capture, CaptureKind, CaptureOutcome } from "../lib/capture.js";
import { captureOneClickFromActiveTab } from "../lib/capture-browser.js";
import type { JobFields } from "../lib/capture-fields.js";
import { createCaptureInbox, PENDING_CAPTURE_KEY } from "../lib/capture-inbox.js";
import type { Incoming } from "../lib/incoming.js";
import type { DetectedQuestion } from "../lib/page-snapshot.js";
import { type CapturedPage, type CurrentTab, isStale } from "../lib/stale-tab.js";
import { CaptureView, type Draft } from "./capture-view.js";
import { StaleBanner } from "./stale-banner.js";

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** The active tab as the browser reports it; the address is absent without host access. */
async function activeTab(): Promise<CurrentTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ? { tabId: tab.id, url: tab.url } : null;
}

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
  const [captured, setCaptured] = useState<CapturedPage | null>(null);
  const [current, setCurrent] = useState<CurrentTab | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const seq = useRef(0);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  /** Puts a capture where it belongs at once; the user reviews it in the boxes it lands in. */
  function apply(
    capture: Pick<Capture, "kind" | "text" | "fromPage" | "url" | "tabId"> & {
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
    // Remember where the draft came from, to tell the user when they have moved on. Pasted text has
    // no page, so it clears the memory instead.
    setCaptured(capture.url === "" ? null : { tabId: capture.tabId, url: capture.url });
    setDismissed(false);
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

  // Compare only: these events say which tab and address is active; nothing on the page is read.
  useEffect(() => {
    let latest = 0;
    const refresh = () => {
      latest += 1;
      const mine = latest;
      // Answers can arrive out of order; only the newest counts.
      void activeTab().then(
        (tab) => mine === latest && setCurrent(tab),
        () => {},
      );
    };
    const onUpdated = (_id: number, change: { url?: string; status?: string }) => {
      if (change.url !== undefined || change.status === "complete") refresh();
    };
    refresh();
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(refresh);
    return () => {
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(refresh);
    };
  }, []);

  const stale = !dismissed && isStale(captured, current);
  const staleHost = (() => {
    try {
      return captured ? new URL(captured.url).hostname : "";
    } catch {
      return "";
    }
  })();

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
    <>
      {stale && (
        <StaleBanner
          host={staleHost}
          busy={busy}
          onCapture={() => void capture()}
          onDismiss={() => setDismissed(true)}
        />
      )}
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
          if (draft) {
            apply({
              kind: draft.kind,
              text: draft.text,
              url: draft.url,
              fields: EMPTY_JOB,
              questions: [],
            });
          }
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
    </>
  );
}
