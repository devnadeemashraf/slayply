import { CAPTURE_TEXT_MAX, type CaptureKind } from "../lib/capture.js";
import type { JobFields } from "../lib/capture-fields.js";

export type Draft = { kind: CaptureKind; text: string; url: string };

export type CaptureViewProps = {
  draft: Draft | null;
  error: string | null;
  busy: boolean;
  job: JobFields;
  notes: string;
  paste: string;
  onCaptureSelection: () => void;
  onCapturePage: () => void;
  onDraftKind: (kind: CaptureKind) => void;
  onDraftText: (text: string) => void;
  onUse: () => void;
  onDiscard: () => void;
  onJobChange: (field: keyof JobFields, value: string) => void;
  onNotesChange: (value: string) => void;
  onPasteChange: (value: string) => void;
  onPasteAdd: () => void;
};

const KIND_LABEL: Record<CaptureKind, string> = {
  jd: "job description",
  question: "question",
  note: "note",
};

const JOB_FIELDS: ReadonlyArray<[keyof JobFields, string]> = [
  ["title", "Job title"],
  ["company", "Company"],
  ["location", "Location"],
  ["salary", "Salary"],
];

export function CaptureView(props: CaptureViewProps) {
  const { draft, error, busy } = props;
  return (
    <section>
      <h2>Capture</h2>
      <p className="muted">
        Select text on a job page and right-click it, or use the buttons. Slayply reads a page only
        when you press a button, never in the background, and never on LinkedIn.
      </p>
      <div className="row">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={props.onCaptureSelection}
        >
          Capture selection
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={props.onCapturePage}>
          Capture visible JD
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div>
          <label htmlFor="capture-kind">Captured text is a</label>
          <select
            id="capture-kind"
            value={draft.kind}
            onChange={(event) => props.onDraftKind(event.target.value as CaptureKind)}
          >
            <option value="jd">Job description</option>
            <option value="question">Question</option>
            <option value="note">Note</option>
          </select>
          <label htmlFor="capture-text">Text (edit before using)</label>
          <textarea
            id="capture-text"
            rows={6}
            maxLength={CAPTURE_TEXT_MAX}
            value={draft.text}
            onChange={(event) => props.onDraftText(event.target.value)}
          />
          {draft.url !== "" && <p className="muted">From {draft.url}</p>}
          <div className="row">
            <button type="button" onClick={props.onUse}>
              {`Use as ${KIND_LABEL[draft.kind]}`}
            </button>
            <button type="button" className="secondary" onClick={props.onDiscard}>
              Discard
            </button>
          </div>
        </div>
      )}
      <label htmlFor="capture-paste">Paste text</label>
      <textarea
        id="capture-paste"
        rows={3}
        maxLength={CAPTURE_TEXT_MAX}
        value={props.paste}
        onChange={(event) => props.onPasteChange(event.target.value)}
      />
      <div className="row">
        <button
          type="button"
          className="secondary"
          disabled={props.paste.trim() === ""}
          onClick={props.onPasteAdd}
        >
          Stage pasted text
        </button>
      </div>
      <h3>Job details</h3>
      {JOB_FIELDS.map(([field, label]) => (
        <div key={field}>
          <label htmlFor={`job-${field}`}>{label}</label>
          <input
            id={`job-${field}`}
            type="text"
            maxLength={200}
            value={props.job[field]}
            onChange={(event) => props.onJobChange(field, event.target.value)}
          />
        </div>
      ))}
      <label htmlFor="capture-notes">Notes (kept only while this panel is open)</label>
      <textarea
        id="capture-notes"
        rows={3}
        maxLength={5_000}
        value={props.notes}
        onChange={(event) => props.onNotesChange(event.target.value)}
      />
    </section>
  );
}
