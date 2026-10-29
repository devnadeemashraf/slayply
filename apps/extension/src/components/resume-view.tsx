import { RESUME_REGION_PRESETS, RESUME_TRACK_PRESETS, type StoredResume } from "@slayply/core";

/** Characters of extracted text shown in the preview; the whole text is still what gets saved. */
export const PREVIEW_CHARS = 1_500;
const CUSTOM = "__custom__";

function isPreset(value: string, presets: readonly string[]): boolean {
  return presets.includes(value);
}

/** A preset dropdown plus a text box that appears for a custom name. */
export function TagField({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: readonly string[];
  onChange: (value: string) => void;
}) {
  const custom = !isPreset(value, presets);
  const id = `tag-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={custom ? CUSTOM : value}
        onChange={(event) => onChange(event.target.value === CUSTOM ? "" : event.target.value)}
      >
        {presets.map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value={CUSTOM}>custom…</option>
      </select>
      {custom && (
        <input
          aria-label={`Custom ${label.toLowerCase()}`}
          type="text"
          maxLength={100}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export type ResumeDraft = {
  name: string;
  text: string;
  pageCount: number;
  truncated: boolean;
  track: string;
  region: string;
};

export function ResumePreviewView({
  draft,
  onTrack,
  onRegion,
  saving = false,
  onSave,
  onCancel,
}: {
  draft: ResumeDraft;
  onTrack: (value: string) => void;
  onRegion: (value: string) => void;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const shown = draft.text.slice(0, PREVIEW_CHARS);
  const canSave = draft.track.trim() !== "" && draft.region.trim() !== "";
  return (
    <div className="preview">
      <p>
        <strong>{draft.name}</strong>
        {`: ${draft.pageCount} ${draft.pageCount === 1 ? "page" : "pages"}, ${draft.text.length.toLocaleString("en-US")} characters.`}
      </p>
      {draft.truncated && (
        <p className="notice" role="status">
          This resume is longer than the size limit, so the end was cut off.
        </p>
      )}
      <label htmlFor="resume-preview">Extracted text (check the order reads correctly)</label>
      <textarea id="resume-preview" rows={10} readOnly value={shown} />
      {draft.text.length > shown.length && (
        <p className="muted">
          Showing the first {PREVIEW_CHARS.toLocaleString("en-US")} characters.
        </p>
      )}
      <TagField
        label="Track"
        value={draft.track}
        presets={RESUME_TRACK_PRESETS}
        onChange={onTrack}
      />
      <TagField
        label="Region"
        value={draft.region}
        presets={RESUME_REGION_PRESETS}
        onChange={onRegion}
      />
      <div className="row">
        <button type="button" disabled={!canSave || saving} onClick={onSave}>
          Save resume
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ResumeListView({
  resumes,
  onRemove,
}: {
  resumes: readonly StoredResume[];
  onRemove: (id: string) => void;
}) {
  if (resumes.length === 0) {
    return <p className="muted">No resumes yet. Upload a PDF; it is read in this browser only.</p>;
  }
  return (
    <ul className="items">
      {resumes.map((resume) => (
        <li key={resume.id}>
          <span className="item-id">{resume.track}</span> {resume.name} · {resume.region} ·{" "}
          {resume.charCount.toLocaleString("en-US")} characters
          {resume.truncated ? " (cut to fit)" : ""}
          <button type="button" className="secondary" onClick={() => onRemove(resume.id)}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
