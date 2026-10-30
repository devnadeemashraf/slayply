import type { StoredProfile, StoredResume } from "@slayply/core";
import { DEFAULT_PRESET, TabPanel, Tabs } from "@slayply/ui";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CapturePanel } from "../../components/capture-panel.js";
import { GeneratePanel } from "../../components/generate-panel.js";
import { JobsTab } from "../../components/jobs-tab.js";
import { ONBOARDING_LAST_STEP, OnboardingCards } from "../../components/onboarding-cards.js";
import { YouEmpty } from "../../components/empty-states.js";
import { PresetPicker } from "../../components/preset-picker.js";
import { ProfilePanel } from "../../components/profile-panel.js";
import { ProviderPanel } from "../../components/provider-panel.js";
import { QuestionnairePanel } from "../../components/questionnaire-panel.js";
import { ResumesPanel } from "../../components/resumes-panel.js";
import { SettingsPanel } from "../../components/settings-panel.js";
import { SetupChecklist } from "../../components/setup-checklist.js";
import { createAnswersStore } from "../../lib/answers-store.js";
import type { JobFields } from "../../lib/capture-fields.js";
import { RELAY_URL } from "../../lib/config.js";
import { createFitStore } from "../../lib/fit-store.js";
import type { Incoming } from "../../lib/incoming.js";
import { SERIOUS } from "../../lib/copy-text.js";
import { showYouEmpty, TABS, type TabId } from "../../lib/panel-nav.js";
import { prefersReducedMotion, withViewTransition } from "../../lib/motion.js";
import { createProfileStore, openProfileDb, ProfileCorruptError } from "../../lib/profile-store.js";
import { monitorRelay, type RelayStatus } from "../../lib/relay-status.js";
import { createResumeStore } from "../../lib/resume-store.js";
import { createSettingsStore, keyFor, type Settings } from "../../lib/settings.js";

const INITIAL_STATUS: RelayStatus = {
  phase: "checking",
  label: "Checking relay…",
  offerDirectMode: false,
};

/** Where a failed storage action is shown: beside the thing the user was doing. */
type ErrorScope = "onboarding" | "profile" | "setup";

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

export function App() {
  const store = useMemo(() => createSettingsStore(chrome.storage.local), []);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const status = useRelayStatus();
  const [tab, setTab] = useState<TabId>("job");
  const [onboardingStep, setOnboardingStep] = useState(0);

  // The preset is a data-theme on the page root; before settings load the default (neon) applies.
  const preset = settings?.preset ?? DEFAULT_PRESET;
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", preset);
  }, [preset]);

  useEffect(() => {
    store.load().then(setSettings, () => setLoadError(SERIOUS.settingsUnreadable));
  }, [store]);

  const db = useMemo(() => openProfileDb(), []);
  const profileStore = useMemo(() => createProfileStore(db), [db]);
  const answersStore = useMemo(() => createAnswersStore(db), [db]);
  const resumeStore = useMemo(() => createResumeStore(db), [db]);
  const fitStore = useMemo(() => createFitStore(db), [db]);
  const [resumes, setResumes] = useState<StoredResume[]>([]);
  const [resumesLoaded, setResumesLoaded] = useState(false);
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
        setResumesError(error instanceof Error ? error.message : SERIOUS.resumesUnreadable),
      )
      .finally(() => setResumesLoaded(true));
  }, [resumeStore]);

  const [actionError, setActionError] = useState<{ scope: ErrorScope; message: string } | null>(
    null,
  );
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [job, setJob] = useState<JobFields>({ title: "", company: "", location: "", salary: "" });

  const refresh = async () => setSettings(await store.load());

  /** Runs a storage action and shows its failure (for example a full quota) instead of dropping it. */
  async function attempt(scope: ErrorScope, action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      setActionError(null);
      return true;
    } catch (error) {
      setActionError({
        scope,
        message: error instanceof Error ? error.message : SERIOUS.genericError,
      });
      return false;
    }
  }

  function errorFor(scope: ErrorScope) {
    return actionError?.scope === scope ? (
      <p className="error" role="alert">
        {actionError.message}
      </p>
    ) : null;
  }

  async function saveKey(provider: Settings["provider"], key: string): Promise<string | null> {
    let invalid: string | null = null;
    const saved = await attempt("setup", async () => {
      const result = await store.saveKey(key, provider);
      if (!result.ok) {
        invalid = result.reason === "empty" ? SERIOUS.keyEmpty : SERIOUS.keyInvalid;
        return;
      }
      await refresh();
    });
    // A storage failure is already on screen through `actionError`; keep the draft so it can be retried.
    return saved ? invalid : "";
  }

  const apiKey = settings ? keyFor(settings, settings.provider) : "";

  /** The saved profile could not be read or opened; shown wherever the profile is needed. */
  const profileProblem = (
    <>
      {profileStatus === "corrupt" && (
        <section>
          <p className="error" role="alert">
            {SERIOUS.profileUnreadable}
          </p>
          <button
            type="button"
            onClick={() =>
              void attempt("profile", async () => {
                await profileStore.discard();
                setProfile(null);
                setProfileStatus("ready");
              })
            }
          >
            {SERIOUS.profileDiscard}
          </button>
        </section>
      )}
      {profileStatus === "error" && (
        <p className="error" role="alert">
          {SERIOUS.profileStorageUnavailable}
        </p>
      )}
      {errorFor("profile")}
    </>
  );

  return (
    <main>
      <header>
        <h1>Slayply</h1>
        <StatusBadge status={status} />
      </header>
      {status.offerDirectMode && <p className="notice">{SERIOUS.directModeNotice}</p>}
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      {settings && !settings.privacyAcknowledged && (
        <OnboardingCards
          step={onboardingStep}
          error={actionError?.scope === "onboarding" ? actionError.message : null}
          onNext={() => setOnboardingStep((step) => Math.min(step + 1, ONBOARDING_LAST_STEP))}
          onBack={() => setOnboardingStep((step) => Math.max(step - 1, 0))}
          onAccept={async () => {
            await attempt("onboarding", async () => {
              await store.acknowledgePrivacy();
              await refresh();
            });
          }}
        />
      )}
      {settings?.privacyAcknowledged && (
        <div className="panels">
          <TabPanel id="job" active={tab === "job"}>
            {profileProblem}
            {profileStatus === "ready" && resumesLoaded && (
              <SetupChecklist
                status={{
                  hasKey: apiKey !== "",
                  hasProfile: profile !== null,
                  hasResume: resumes.length > 0,
                }}
                onGo={setTab}
              />
            )}
            <CapturePanel onIncoming={setIncoming} job={job} onJobChange={setJob} />
            {profileStatus === "ready" && apiKey !== "" && (
              <GeneratePanel
                apiKey={apiKey}
                choice={{
                  provider: settings.provider,
                  model: settings.model,
                  effort: settings.effort,
                }}
                direct={settings.directMode}
                profile={profile}
                resumes={resumes}
                fitStore={fitStore}
                incoming={incoming}
                job={job}
              />
            )}
          </TabPanel>
          <TabPanel id="jobs" active={tab === "jobs"}>
            <JobsTab />
          </TabPanel>
          <TabPanel id="you" active={tab === "you"}>
            {profileProblem}
            {showYouEmpty({
              profileStatus,
              profile,
              resumeCount: resumes.length,
              resumesError,
            }) && <YouEmpty />}
            {profileStatus === "loading" && <p className="muted">{SERIOUS.profileLoading}</p>}
            {resumesError && (
              <p className="error" role="alert">
                {resumesError}
              </p>
            )}
            {profileStatus === "ready" && !resumesError && (
              <ResumesPanel resumes={resumes} store={resumeStore} onChange={setResumes} />
            )}
            {profileStatus === "ready" && (
              <QuestionnairePanel
                store={answersStore}
                onProfileChanged={() => {
                  profileStore.load().then(setProfile, () => setProfileStatus("error"));
                }}
              />
            )}
            {profileStatus === "ready" && (
              <ProfilePanel profile={profile} store={profileStore} onChange={setProfile} />
            )}
          </TabPanel>
          <TabPanel id="setup" active={tab === "setup"}>
            {errorFor("setup")}
            <PresetPicker
              value={settings.preset}
              onChange={(next) =>
                void attempt("setup", async () => {
                  await store.setPreset(next);
                  await refresh();
                })
              }
            />
            <ProviderPanel
              settings={settings}
              onChoice={(choice) =>
                void attempt("setup", async () => {
                  await store.setChoice(choice);
                  await refresh();
                })
              }
              onSaveKey={saveKey}
              onClearKey={async (provider) => {
                await attempt("setup", async () => {
                  await store.clearKey(provider);
                  await refresh();
                });
              }}
            />
            <SettingsPanel
              db={db}
              settings={store}
              directMode={settings.directMode}
              onDirectModeChange={() => void refresh()}
            />
          </TabPanel>
        </div>
      )}
      {settings?.privacyAcknowledged && (
        <div className="dock">
          <Tabs
            label="Slayply sections"
            tabs={TABS}
            active={tab}
            onSelect={(id) => {
              const target = TABS.find((entry) => entry.id === id);
              if (!target) return;
              withViewTransition(
                () => flushSync(() => setTab(target.id)),
                document,
                prefersReducedMotion(window.matchMedia?.bind(window)),
              );
            }}
          />
        </div>
      )}
    </main>
  );
}
