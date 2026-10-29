import type { StoredResume } from "@slayply/core";
import { useRef, useState } from "react";
import { describeExtractFailure, extractResumeText } from "../lib/pdf-extract.js";
import { loadPdfjs } from "../lib/pdf-loader.js";
import type { ResumeStore } from "../lib/resume-store.js";
import { type ResumeDraft, ResumeListView, ResumePreviewView } from "./resume-view.js";

export function ResumesPanel({
  resumes,
  store,
  onChange,
}: {
  resumes: readonly StoredResume[];
  store: ResumeStore;
  onChange: (resumes: StoredResume[]) => void;
}) {
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // A later pick supersedes an earlier one that is still being read.
  const pick = useRef(0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const mine = ++pick.current;
    setReading(true);
    setMessage(null);
    setDraft(null);
    const result = await extractResumeText(file, loadPdfjs).finally(() => {
      if (mine === pick.current) setReading(false);
    });
    if (mine !== pick.current) return;
    if (input.current) input.current.value = "";
    if (!result.ok) {
      setMessage(describeExtractFailure(result.reason));
      return;
    }
    setDraft({
      name: file.name,
      text: result.text,
      pageCount: result.pageCount,
      truncated: result.truncated,
      track: "sde",
      region: "master",
    });
  }

  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      await store.add(draft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The resume could not be saved.");
      setSaving(false);
      return;
    }
    // Saved. Leave the form first so a failed refresh cannot invite a second save.
    setDraft(null);
    setSaving(false);
    try {
      onChange(await store.list());
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The saved resumes could not be read.");
    }
  }

  async function remove(id: string) {
    try {
      await store.remove(id);
      onChange(await store.list());
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The resume could not be removed.");
    }
  }

  return (
    <section>
      <h2>Resumes</h2>
      <p className="muted">
        The PDF is read in this browser and only its text is saved on this device. The text of the
        resume you pick is sent with each answer request.
      </p>
      <ResumeListView resumes={resumes} onRemove={(id) => void remove(id)} />
      <label htmlFor="resume-file">Upload a PDF resume</label>
      <input
        id="resume-file"
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        disabled={reading}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {reading && <p className="muted">Reading the PDF…</p>}
      {draft && (
        <ResumePreviewView
          draft={draft}
          onTrack={(track) => setDraft({ ...draft, track })}
          onRegion={(region) => setDraft({ ...draft, region })}
          saving={saving}
          onSave={() => void save()}
          onCancel={() => setDraft(null)}
        />
      )}
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
