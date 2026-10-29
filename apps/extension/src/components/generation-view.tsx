import type { GenerationState } from "../lib/generate-controller.js";
import { copyTextOf } from "../lib/generate-controller.js";
import type { CopyState } from "../lib/copy.js";

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

/** Renders the generation state. Model output is plain text children only, never HTML. */
export function GenerationView({
  state,
  copyState,
  onCopy,
}: {
  state: GenerationState;
  copyState: CopyState;
  onCopy: () => void;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "error") {
    return (
      <p className="error" role="alert">
        {state.message}
      </p>
    );
  }

  const copyable = copyTextOf(state) !== null;

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
              <p className="answer">{output.text}</p>
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
