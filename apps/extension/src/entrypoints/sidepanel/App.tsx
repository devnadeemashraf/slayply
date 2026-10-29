import type { StoredProfile, StoredResume } from "@slayply/core";
import { useEffect, useMemo, useState } from "react";
import { GeneratePanel } from "../../components/generate-panel.js";
import { ProfilePanel } from "../../components/profile-panel.js";
import { QuestionnairePanel } from "../../components/questionnaire-panel.js";
import { ResumesPanel } from "../../components/resumes-panel.js";
import { createAnswersStore } from "../../lib/answers-store.js";
import { PRIVACY_STATEMENT, RELAY_URL } from "../../lib/config.js";
import { createProfileStore, openProfileDb, ProfileCorruptError } from "../../lib/profile-store.js";
import { monitorRelay, type RelayStatus } from "../../lib/relay-status.js";
import { createResumeStore } from "../../lib/resume-store.js";
import { createSettingsStore, type Settings } from "../../lib/settings.js";

const INITIAL_STATUS: RelayStatus = {
  phase: "checking",
  label: "Checking relay…",
  offerDirectMode: false,
};

function useRelayStatus(): RelayStatus {
  const [status, setStatus] = useState<RelayStatus>(INITIAL_STATUS);
  useEffect(
    () =>
      monitorRelay({
        url: RELAY_URL,
        fetchFn: (url, init) => fetch(url, init),
        onChange: setStatus,
      }),
    [],
  );
  return status;
}

function StatusBadge({ status }: { status: RelayStatus }) {
  return (
    <p className={`status status-${status.phase}`} role="status">
      <span className="dot" aria-hidden="true" />
      {status.label}
    </p>
  );
}

function Onboarding({ onAccept }: { onAccept: () => void }) {
  return (
    <section>
      <h2>Before you start</h2>
      <p>{PRIVACY_STATEMENT}</p>
      <button type="button" onClick={onAccept}>
        I understand
      </button>
    </section>
  );
}

function KeyForm({
  hasKey,
  onSave,
  onClear,
}: {
  hasKey: boolean;
  onSave: (key: string) => Promise<string | null>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <section>
      <h2>Anthropic API key</h2>
      <p className="muted">{hasKey ? "A key is saved in this browser." : "No key saved yet."}</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const error = await onSave(draft);
          setMessage(error === "" ? null : error);
          if (error === null) setDraft("");
        }}
      >
        <label htmlFor="anthropic-key">Key</label>
        <input
          id="anthropic-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="sk-ant-…"
        />
        <div className="row">
          <button type="submit">Save key</button>
          {hasKey && (
            <button type="button" className="secondary" onClick={() => void onClear()}>
              Remove key
            </button>
          )}
        </div>
        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
      </form>
    </section>
  );
}

export function App() {
  const store = useMemo(() => createSettingsStore(chrome.storage.local), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const status = useRelayStatus();

  useEffect(() => {
    store.load().then(setSettings, () => setLoadError("Could not read saved settings."));
  }, [store]);

  const db = useMemo(() => openProfileDb(), []);
  const profileStore = useMemo(() => createProfileStore(db), [db]);
  const answersStore = useMemo(() => createAnswersStore(db), [db]);
  const resumeStore = useMemo(() => createResumeStore(db), [db]);
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const [resumesError, setResumesError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  // Nothing may import, edit or generate until the saved profile has loaded: acting on a missing
  // profile would restart the ID counters and could overwrite the record that failed to load.
  const [profileStatus, setProfileStatus] = useState<"loading" | "ready" | "corrupt" | "error">(
    "loading",
  );

  useEffect(() => {
    profileStore.load().then(
      (loaded) => {
        setProfile(loaded);
        setProfileStatus("ready");
      },
      (error: unknown) =>
        setProfileStatus(error instanceof ProfileCorruptError ? "corrupt" : "error"),
    );
  }, [profileStore]);

  useEffect(() => {
    resumeStore
      .list()
      .then(setResumes, (error: unknown) =>
        setResumesError(
          error instanceof Error ? error.message : "Saved resumes could not be read.",
        ),
      );
  }, [resumeStore]);

  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = async () => setSettings(await store.load());

  /** Runs a storage action and shows its failure (for example a full quota) instead of dropping it. */
  async function attempt(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      setActionError(null);
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Something went wrong.");
      return false;
    }
  }

  async function saveKey(key: string): Promise<string | null> {
    let invalid: string | null = null;
    const saved = await attempt(async () => {
      const result = await store.saveKey(key);
      if (!result.ok) {
        invalid =
          result.reason === "empty"
            ? "Enter your API key."
            : "That key has characters the relay cannot accept.";
        return;
      }
      await refresh();
    });
    // A storage failure is already on screen through `actionError`; keep the draft so it can be retried.
    return saved ? invalid : "";
  }

  return (
    <main>
      <header>
        <h1>Slayply</h1>
        <StatusBadge status={status} />
      </header>
      {status.offerDirectMode && (
        <p className="notice">
          The relay is not answering. Direct Mode (calling the provider from this browser) will be
          available in a later release.
        </p>
      )}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {settings && !settings.privacyAcknowledged && (
        <Onboarding
          onAccept={async () => {
            await attempt(async () => {
              await store.acknowledgePrivacy();
              await refresh();
            });
          }}
        />
      )}
      {settings?.privacyAcknowledged && profileStatus === "corrupt" && (
        <section>
          <p className="error" role="alert">
            Your saved profile could not be read. Discarding it deletes it, and your IDs (F01, S01…)
            restart. Only do this if you will import your context pack again.
          </p>
          <button
            type="button"
            onClick={() =>
              void attempt(async () => {
                await profileStore.discard();
                setProfile(null);
                setProfileStatus("ready");
              })
            }
          >
            Discard the unreadable profile
          </button>
        </section>
      )}
      {settings?.privacyAcknowledged && profileStatus === "error" && (
        <p className="error" role="alert">
          Could not open the local profile storage, so profile features and generating are
          unavailable. Reload the panel to try again.
        </p>
      )}
      {settings?.privacyAcknowledged &&
        profileStatus === "ready" &&
        settings.anthropicKey !== "" && (
          <GeneratePanel apiKey={settings.anthropicKey} profile={profile} resumes={resumes} />
        )}
      {settings?.privacyAcknowledged && resumesError && (
        <p className="error" role="alert">
          {resumesError}
        </p>
      )}
      {settings?.privacyAcknowledged && profileStatus === "ready" && !resumesError && (
        <ResumesPanel resumes={resumes} store={resumeStore} onChange={setResumes} />
      )}
      {settings?.privacyAcknowledged && profileStatus === "ready" && (
        <QuestionnairePanel
          store={answersStore}
          onProfileChanged={() => {
            profileStore.load().then(setProfile, () => setProfileStatus("error"));
          }}
        />
      )}
      {settings?.privacyAcknowledged && profileStatus === "ready" && (
        <ProfilePanel profile={profile} store={profileStore} onChange={setProfile} />
      )}
      {settings?.privacyAcknowledged && (
        <KeyForm
          hasKey={settings.anthropicKey !== ""}
          onSave={saveKey}
          onClear={async () => {
            await attempt(async () => {
              await store.clearKey();
              await refresh();
            });
          }}
        />
      )}
    </main>
  );
}
