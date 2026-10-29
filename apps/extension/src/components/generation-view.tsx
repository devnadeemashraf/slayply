import {
  type CheckedSentence,
  checkClaims,
  type OutputAnswer,
  removeSentence,
  summarizeClaims,
} from "@slayply/core";
import { useMemo } from "react";
import type { CopyState } from "../lib/copy.js";
import type { GenerationState } from "../lib/generate-controller.js";
import { copyTextOf } from "../lib/generate-controller.js";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "Copy to Clipboard",
  copied: "Copied!",
  failed: "Copy failed",
};

function CopyButton({
  enabled,
  copyState,
  onCopy,
}: {
  enabled: boolean;
  copyState: CopyState;
  onCopy: () => void;
}) {
  return (
    <button type="button" disabled={!enabled} onClick={onCopy}>
      {COPY_LABEL[copyState]}
    </button>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function claimSummary(checked: readonly CheckedSentence[]): string | null {
  const { cited, uncited } = summarizeClaims(checked);
  if (uncited > 0) {
    const sentences = plural(uncited, "sentence has", "sentences have");
    return `${sentences} no matching citation. Remove them or check them before you send.`;
  }
  if (cited > 0) return `${plural(cited, "sentence", "sentences")} checked against your profile.`;
  return null;
}

function whyUncited(sentence: CheckedSentence): string {
  if (sentence.invalidIds.length > 0) {
    return `${sentence.invalidIds.join(", ")} not in your profile`;
  }
  return "no matching citation";
}

/** One answer with uncited first-person sentences marked and removable. Plain text children only. */
function CheckedAnswer({
  output,
  text,
  state,
  onEdit,
}: {
  output: OutputAnswer;
  text: string;
  state: Extract<GenerationState, { phase: "done" }>;
  onEdit: (outputId: string, text: string) => void;
}) {
  const checked = useMemo(
    () => checkClaims(text, output.claims, state.profile),
    [text, output.claims, state.profile],
  );
  const summary = claimSummary(checked);
  const sources = new Map<string, string>();
  for (const sentence of checked) {
    for (const source of sentence.cited) sources.set(source.id, source.text);
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const sentence of checked) {
    if (sentence.start > cursor) parts.push(text.slice(cursor, sentence.start));
    if (sentence.status === "uncited") {
      parts.push(
        <span key={sentence.start}>
          <mark className="uncited">{sentence.text}</mark>{" "}
          <span className="muted">({whyUncited(sentence)}) </span>
          <button
            type="button"
            className="secondary remove"
            aria-label={`Remove: ${sentence.text}`}
            onClick={() => onEdit(output.id, removeSentence(text, sentence))}
          >
            Remove
          </button>
        </span>,
      );
    } else {
      parts.push(sentence.text);
    }
    cursor = sentence.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <>
      <p className="answer">{parts}</p>
      {summary && <p className="muted">{summary}</p>}
      {sources.size > 0 && (
        <ul className="citations">
          {[...sources].map(([id, source]) => (
            <li key={id}>
              <strong>{id}</strong> {source}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Renders the generation state. Model output is plain text children only, never HTML. */
export function GenerationView({
  state,
  copyState,
  onCopy,
  edits,
  onEdit,
}: {
  state: GenerationState;
  copyState: CopyState;
  onCopy: () => void;
  /** Answer text after the user removed sentences, by output ID. */
  edits: Readonly<Record<string, string>>;
  onEdit: (outputId: string, text: string) => void;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "error") {
    return (
      <p className="error" role="alert">
        {state.message}
      </p>
    );
  }

  const copyable = copyTextOf(state, edits) !== null;

  return (
    <section className="result" aria-live="polite">
      {state.phase === "streaming" && (
        <>
          <p className="muted">
            {state.attempt === 2
              ? "Reformatting answer, attempt 2 of 2"
              : "Drafting… the format is checked when it finishes"}
          </p>
          <p className="answer">{state.preview}</p>
        </>
      )}
      {state.phase === "done" && (
        <>
          {state.response.outputs.map((output) => (
            <article key={output.id}>
              {state.response.outputs.length > 1 && <h3>{output.label}</h3>}
              <CheckedAnswer
                output={output}
                text={edits[output.id] ?? output.text}
                state={state}
                onEdit={onEdit}
              />
            </article>
          ))}
          {state.response.warnings.length > 0 && (
            <ul className="warnings">
              {state.response.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {state.phase === "raw" && (
        <>
          <p className="notice">
            Unvalidated, check before use. The reply was not in the expected format.
          </p>
          <p className="answer">{state.rawText}</p>
        </>
      )}
      <CopyButton enabled={copyable} copyState={copyState} onCopy={onCopy} />
    </section>
  );
}
