/** Hard ceiling for a serialized request body; the relay enforces the same number on bytes. */
export const MAX_PAYLOAD_BYTES = 500 * 1024;

export const LIMITS = {
  jdChars: 60_000,
  resumeChars: 100_000,
  shortTextChars: 500,
  urlChars: 2_048,
  questionChars: 5_000,
  questionMaxChars: 20_000,
  maxQuestions: 50,
  factChars: 2_000,
  maxFacts: 500,
  maxStories: 100,
  maxPrefs: 100,
  maxRules: 100,
  outputChars: 50_000,
  maxOutputs: 100,
  maxClaims: 1_000,
  maxListItems: 100,
} as const;

/** Stable citation IDs: `F01` for facts, `S03` for stories. */
export const FACT_ID_PATTERN = /^F\d{2,}$/;
export const STORY_ID_PATTERN = /^S\d{2,}$/;
export const CITATION_ID_PATTERN = /^[FS]\d{2,}$/;
