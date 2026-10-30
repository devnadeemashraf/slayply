import { PRIVACY_STATEMENT, TRAINING_WARNING } from "../lib/privacy.js";

export type SettingsViewProps = {
  confirmingWipe: boolean;
  busy: boolean;
  message: string | null;
  directMode: boolean;
  onToggleDirect: (on: boolean) => void;
  jobSites: boolean;
  onToggleJobSites: (on: boolean) => void;
  onExport: () => void;
  onChooseFile: (file: File | undefined) => void;
  onAskWipe: () => void;
  onCancelWipe: () => void;
  onConfirmWipe: () => void;
};

export function SettingsView(props: SettingsViewProps) {
  const { confirmingWipe, busy } = props;
  return (
    <section>
      <h2>Settings and privacy</h2>
      <details>
        <summary>Privacy statement</summary>
        <p>{PRIVACY_STATEMENT}</p>
      </details>
      <p className="notice">{TRAINING_WARNING}</p>

      <h3>Job sites</h3>
      <label>
        <input
          type="checkbox"
          checked={props.jobSites}
          disabled={busy}
          onChange={(event) => props.onToggleJobSites(event.target.checked)}
        />{" "}
        Capture on popular job sites
      </label>
      <p className="muted">
        Lets the Capture button read pages, including application forms embedded in them, on
        Greenhouse, Lever, Ashby, Workday, Oracle, iCIMS, SmartRecruiters and similar sites without
        asking each time. It reads only when you capture, never in the background, and never on
        LinkedIn. Other sites ask once. You can turn this off here or in the browser's extension
        settings.
      </p>

      <h3>Direct Mode</h3>
      <label>
        <input
          type="checkbox"
          checked={props.directMode}
          disabled={busy}
          onChange={(event) => props.onToggleDirect(event.target.checked)}
        />{" "}
        Skip the relay and call Anthropic from this browser
      </label>
      <p className="muted">
        Your key and your text go straight to api.anthropic.com and through no Slayply server. The
        browser asks your permission to reach that address when you turn this on. Claude only for
        now.
      </p>

      <h3>Backup</h3>
      <div className="row">
        <button type="button" className="secondary" disabled={busy} onClick={props.onExport}>
          Export everything (JSON)
        </button>
      </div>
      <p className="muted">
        The file holds your profile, answers (including private details), resumes and saved job
        results. It never contains your API key. Keep it somewhere safe.
      </p>
      <label htmlFor="backup-file">Import a backup (.json)</label>
      <input
        id="backup-file"
        type="file"
        accept="application/json,.json"
        disabled={busy}
        onChange={(event) => {
          props.onChooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <p className="muted">
        Importing replaces what is saved here. Nothing changes if the file is invalid.
      </p>

      <h3>Delete all local data</h3>
      {confirmingWipe ? (
        <>
          <p className="error" role="alert">
            This deletes your profile, answers, resumes, saved job results and API key from this
            browser. It cannot be undone. Export first if you want a copy.
          </p>
          <div className="row">
            <button type="button" disabled={busy} onClick={props.onConfirmWipe}>
              Yes, delete everything
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={props.onCancelWipe}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="secondary" disabled={busy} onClick={props.onAskWipe}>
          Delete all local data
        </button>
      )}
      {props.message && <p role="status">{props.message}</p>}
    </section>
  );
}
