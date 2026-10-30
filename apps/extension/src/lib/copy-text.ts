/**
 * User-facing wording for the moments where the panel has a voice, and for the messages that
 * must stay plain. The rule (see copy-voice.test.ts): playful text lives only in `PLAYFUL`
 * (empty states, loading, the relay warm-up) and nothing else in the source may contain an emoji.
 * Privacy, errors, keys and data deletion say what happened and what to do, with no jokes.
 * The long static text of the settings, questionnaire and capture panels is still written in
 * those components; the source scan in the test covers it.
 */

export const PLAYFUL = {
  relayWarming: "Waking the relay… cooking your answer ☕",
  fitLoading: "Reading the fine print…",
  draftLoading: "Cooking up a draft… we check the format at the end",
  jobEmptyTitle: "No job yet",
  jobEmptyBody: "Open a posting and hit Capture, or paste a description below.",
  jobsEmptyTitle: "No saved jobs yet",
  jobsEmptyBody: "Save a job from the Job tab and it waits here, with where it stands.",
  youEmptyTitle: "Nothing here yet",
  youEmptyBody:
    "Add a few facts, answer the questionnaire or upload a resume, and your drafts will sound like you.",
} as const;

export const SERIOUS = {
  relayChecking: "Checking relay…",
  relayConnected: "Connected",
  relayNotResponding: "Relay not responding. You can switch to Direct Mode.",
  directModeNotice:
    "The relay is not answering. You can turn on Direct Mode in Setup to call Claude straight from this browser.",
  settingsUnreadable: "Could not read saved settings.",
  profileLoading: "Loading your profile…",
  profileUnreadable:
    "Your saved profile could not be read. Discarding it deletes it, and your IDs (F01, S01…) restart. Only do this if you will import your context pack again.",
  profileDiscard: "Discard the unreadable profile",
  profileStorageUnavailable:
    "Could not open the local profile storage, so profile features and generating are unavailable. Reload the panel to try again.",
  resumesUnreadable: "Saved resumes could not be read.",
  keyEmpty: "Enter your API key.",
  keyInvalid: "That key has characters the relay cannot accept.",
  genericError: "Something went wrong.",
  reformattingAnswer: "Reformatting answer, attempt 2 of 2",
  reformattingFit: "Reformatting the fit check, attempt 2 of 2",
} as const;
