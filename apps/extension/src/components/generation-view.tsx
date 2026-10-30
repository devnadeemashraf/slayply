import {
  type CheckedSentence,
  checkClaims,
  type OutputAnswer,
  removeSentence,
  summarizeClaims,
} from "@slayply/core";
import { Button, Card, StickerBadge } from "@slayply/ui";
import { useEffect, useMemo, useState } from "react";
import type { CopyState } from "../lib/copy.js";
import { fitToLimit } from "../lib/char-limit.js";
import { PLAYFUL, SERIOUS } from "../lib/copy-text.js";
import type { GenerationState } from "../lib/generate-controller.js";
import { copyTextOf } from "../lib/generate-controller.js";
import { createExit, exitDelay, prefersReducedMotion } from "../lib/motion.js";
import { CharRing } from "./char-ring.js";

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
    <Button
      className={copyState === "copied" ? "sl-pop" : undefined}
      disabled={!enabled}
      onClick={onCopy}
    >
      {copyState === "copied" && <span aria-hidden="true">✓ </span>}
      {COPY_LABEL[copyState]}
    </Button>
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

/** Offers to drop trailing sentences until the text fits, or says why it cannot. */
function FitControl({
  text,
  max,
  onFit,
}: {
  text: string;
  max: number;
  onFit: (text: string) => void;
}) {
  const fitted = fitToLimit(text, max);
  if (!fitted) {
    return (
      <p className="muted">Too long to trim by whole sentences. Shorten it or write it again.</p>
    );
  }
  return (
    <Button variant="secondary" onClick={() => onFit(fitted.text)}>
      {`Fit to ${max.toLocaleString("en-US")} characters`}
    </Button>
  );
}

/** One answer with uncited first-person sentences marked and removable. Plain text children only. */
function CheckedAnswer({
  output,
  text,
  max,
  state,
  onEdit,
  onFit,
}: {
  output: OutputAnswer;
  text: string;
  max?: number;
  state: Extract<GenerationState, { phase: "done" }>;
  onEdit: (outputId: string, text: string) => void;
  onFit?: (outputId: string, text: string) => void;
}) {
  const checked = useMemo(
    () => checkClaims(text, output.claims, state.profile),
    [text, output.claims, state.profile],
  );
  const summary = claimSummary(checked);
  const over = max !== undefined && max > 0 && text.length > max;

  // A removed sentence fades out before it goes, unless the user has asked for no motion.
  const [leaving, setLeaving] = useState<number | null>(null);
  const exit = useMemo(
    () =>
      createExit<number>(
        exitDelay(
          prefersReducedMotion(
            typeof window === "undefined" ? undefined : window.matchMedia?.bind(window),
          ),
        ),
        setLeaving,
      ),
    [],
  );
  useEffect(() => () => exit.cancel(), [exit]);
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
        <span key={sentence.start} className={leaving === sentence.start ? "leaving" : undefined}>
          <mark className="uncited">{sentence.text}</mark>{" "}
          <span className="muted">({whyUncited(sentence)}) </span>
          <button
            type="button"
            className="secondary remove"
            aria-label={`Remove: ${sentence.text}`}
            onClick={() =>
              exit.start(sentence.start, () => onEdit(output.id, removeSentence(text, sentence)))
            }
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
      <CharRing length={text.length} max={max} />
      {over && onFit && (
        <FitControl text={text} max={max as number} onFit={(fitted) => onFit(output.id, fitted)} />
      )}
      {summary && <p className="muted">{summary}</p>}
      {sources.size > 0 && (
        <div className="receipts">
          {[...sources].map(([id, source]) => (
            <details key={id} className="receipt">
              <summary>
                <StickerBadge>{id}</StickerBadge> receipt
              </summary>
              <p>{source}</p>
            </details>
          ))}
        </div>
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
  onFit,
  limits,
}: {
  state: GenerationState;
  copyState: CopyState;
  onCopy: () => void;
  /** Character limit per output ID, for the ring. */
  limits?: Readonly<Record<string, number>>;
  /** Answer text after the user removed sentences, by output ID. */
  edits: Readonly<Record<string, string>>;
  onEdit: (outputId: string, text: string) => void;
  /** Replaces an answer with its trimmed text; the fit button shows only when this is given. */
  onFit?: (outputId: string, text: string) => void;
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
            {state.attempt === 2 ? SERIOUS.reformattingAnswer : PLAYFUL.draftLoading}
          </p>
          <p className="answer">{state.preview}</p>
        </>
      )}
      {state.phase === "done" && (
        <>
          {state.response.outputs.map((output) => (
            <Card
              key={output.id}
              title={state.response.outputs.length > 1 ? output.label : undefined}
            >
              <CheckedAnswer
                output={output}
                text={edits[output.id] ?? output.text}
                max={limits?.[output.id]}
                state={state}
                onEdit={onEdit}
                onFit={onFit}
              />
            </Card>
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
