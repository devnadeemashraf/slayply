import type { Length, Tone } from "@slayply/core";
import { Button } from "@slayply/ui";
import { DRAFT_KINDS, type DraftKindId, draftKind } from "../lib/draft-kinds.js";

const TONES: readonly { id: Tone; label: string }[] = [
  { id: "crisp", label: "Crisp" },
  { id: "warm", label: "Warm" },
  { id: "bold", label: "Bold" },
];
const LENGTHS: readonly { id: Length; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];

/** What to write, in which tone and length, and (for drafts) the character limit. */
export function DraftControls({
  kind,
  tone,
  length,
  maxChars,
  canResize,
  onKind,
  onTone,
  onLength,
  onMaxChars,
  onResize,
}: {
  kind: DraftKindId;
  tone: Tone;
  length: Length;
  /** Raw text of the limit box; empty means no limit. */
  maxChars: string;
  /** True once there is a result to make shorter or longer. */
  canResize: boolean;
  onKind: (kind: DraftKindId) => void;
  onTone: (tone: Tone) => void;
  onLength: (length: Length) => void;
  onMaxChars: (value: string) => void;
  onResize: (direction: "shorter" | "longer") => void;
}) {
  return (
    <fieldset>
      <legend>What to write</legend>
      <label htmlFor="draft-kind">Write</label>
      <select
        id="draft-kind"
        value={kind}
        onChange={(event) => onKind(event.target.value as DraftKindId)}
      >
        {DRAFT_KINDS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <label htmlFor="draft-tone">Tone</label>
      <select id="draft-tone" value={tone} onChange={(event) => onTone(event.target.value as Tone)}>
        {TONES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <label htmlFor="draft-length">Length</label>
      <select
        id="draft-length"
        value={length}
        onChange={(event) => onLength(event.target.value as Length)}
      >
        {LENGTHS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      {draftKind(kind).takesLimit && (
        <>
          <label htmlFor="draft-limit">Character limit (optional)</label>
          <input
            id="draft-limit"
            inputMode="numeric"
            placeholder="For example 300 for a LinkedIn note"
            value={maxChars}
            onChange={(event) => onMaxChars(event.target.value)}
          />
        </>
      )}
      {canResize && (
        <div>
          <Button
            variant="secondary"
            disabled={length === "short"}
            onClick={() => onResize("shorter")}
          >
            Shorter
          </Button>
          <Button
            variant="secondary"
            disabled={length === "long"}
            onClick={() => onResize("longer")}
          >
            Longer
          </Button>
        </div>
      )}
    </fieldset>
  );
}
