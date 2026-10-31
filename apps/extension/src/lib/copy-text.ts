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
  jobEmptyTitle: "No job yet",
  jobEmptyBody: "Open a posting and hit Capture, or paste a description below.",
  jobsEmptyTitle: "No saved jobs yet",
  jobsEmptyBody: "Save a job from the Apply tab and it waits here, with where it stands.",
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
  errorTimeout:
    "The model took longer than 2 minutes, so the relay stopped it and nothing was kept. Thinking models are the slowest: pick a faster model or a lower effort in Setup, then try again.",
  errorRateLimited: "Too many requests in a short time. Wait a minute, then try again.",
  errorTooManyStreams:
    "Two generations are already running. Wait for one to finish, then try again.",
  errorUpstreamRateLimited:
    "The provider is rate limiting this key. Wait a bit, check your plan's limits, or pick another model in Setup.",
  errorOverloaded:
    "The provider is overloaded. Try again in a moment, or pick another model in Setup.",
  errorAuth: "The provider rejected the API key. Check the key in Setup.",
  errorRejected:
    "The provider rejected the request. The model may not support it: pick another model in Setup.",
  errorUpstream: "The provider request failed. Try again, or pick another model in Setup.",
  errorIncomplete: "The answer stream ended early and nothing was kept. Try again.",
  errorForbiddenOrigin:
    "This extension is not allowed to use the relay. Ask whoever runs it to add this extension, or turn on Direct Mode in Setup (Claude only).",
  errorUpstreamRateLimitedDirect:
    "The provider is rate limiting this key. Wait a bit and check your plan's limits.",
  errorOverloadedDirect: "The provider is overloaded. Try again in a moment.",
  errorRejectedDirect: "The provider rejected the request. Try again, and check your key's access.",
  errorUpstreamDirect: "The provider request failed. Try again in a moment.",
  stageConnecting: "Connecting…",
  stageWaiting: "Waiting for the model…",
  stageWriting: "Writing…",
  stageChecking: "Checking the result…",
  secondAttempt: "The reply was not in the expected format, so this is attempt 2 of 2.",
  slowRun:
    "This is taking longer than usual. Thinking models can take a minute or two, and the relay stops a run at 2 minutes. You can cancel and pick a faster model or a lower effort in Setup.",
  cancel: "Cancel",
} as const;
