import {
  type CheckedMatch,
  checkFitMatches,
  type FitCheck,
  type StoredResume,
} from "@slayply/core";
import { Button, Card, StickerBadge, type StickerTone } from "@slayply/ui";
import { useMemo } from "react";
import type { GenerationState } from "../lib/generate-controller.js";

const CHANCE_TONE: Record<FitCheck["chance"], StickerTone> = {
  high: "ok",
  medium: "warn",
  low: "bad",
};

export type FitResult = {
  fit: FitCheck;
  /** The facts and stories the result was checked against, not today's profile. */
  profile: Parameters<typeof checkFitMatches>[1];
  /** True when it came from the saved copy for this job instead of a new run. */
  cached: boolean;
};

export type ResumeSuggestion = { resume: StoredResume; active: boolean };

function MatchRow({ row }: { row: CheckedMatch }) {
  const missing = row.status === "uncited";
  const invalid = row.invalidIds.length > 0 ? `: ${row.invalidIds.join(", ")}` : "";
  return (
    <tr>
      <td>{row.match.want}</td>
      <td>
        {row.match.have}
        {missing && <span className="muted"> (no matching fact{invalid})</span>}
        {row.cited.length > 0 && (
          <ul className="citations">
            {row.cited.map((source) => (
              <li key={source.id}>
                <strong>{source.id}</strong> {source.text}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function ResumeLine({
  fit,
  suggestion,
  onUseResume,
}: {
  fit: FitCheck;
  suggestion: ResumeSuggestion | null;
  onUseResume: () => void;
}) {
  const label = `Recommended resume: ${fit.resume.track}, ${fit.resume.region}.`;
  if (!suggestion) {
    return (
      <p>
        {label} <span className="muted">No saved resume has that track. Pick one yourself.</span>
      </p>
    );
  }
  if (suggestion.active) {
    return (
      <p>
        {label} <span className="muted">"{suggestion.resume.name}" is selected.</span>
      </p>
    );
  }
  return (
    <p>
      {label}{" "}
      <Button variant="secondary" onClick={onUseResume}>
        {`Use this resume (${suggestion.resume.name})`}
      </Button>
    </p>
  );
}

function Result({
  result,
  suggestion,
  onUseResume,
  onRerun,
}: {
  result: FitResult;
  suggestion: ResumeSuggestion | null;
  onUseResume: () => void;
  onRerun: () => void;
}) {
  const { fit } = result;
  const rows = useMemo(() => checkFitMatches(fit, result.profile), [fit, result.profile]);
  return (
    <>
      <p>
        <StickerBadge tone={CHANCE_TONE[fit.chance]}>{`Chance: ${fit.chance}`}</StickerBadge>{" "}
        {fit.reason}
      </p>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>They want</th>
              <th>You have</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <MatchRow key={index} row={row} />
            ))}
          </tbody>
        </table>
      )}
      <List title="Gaps" items={fit.gaps} />
      <List title="Deal-breakers" items={fit.dealBreakers} />
      <ResumeLine fit={fit} suggestion={suggestion} onUseResume={onUseResume} />
      {fit.salaryAnswer && (
        <>
          <h4>Suggested salary answer</h4>
          <p className="answer">{fit.salaryAnswer}</p>
        </>
      )}
      <p className="muted">
        {result.cached ? "Saved result for this job. " : ""}
        <Button variant="secondary" onClick={onRerun}>
          Run again
        </Button>
      </p>
    </>
  );
}

/** Renders a fit check. Model output is plain text children only, never HTML. */
export function FitView({
  state,
  result,
  suggestion,
  onUseResume,
  onRerun,
}: {
  state: GenerationState;
  result: FitResult | null;
  suggestion: ResumeSuggestion | null;
  onUseResume: () => void;
  onRerun: () => void;
}) {
  if (state.phase === "streaming") {
    return (
      <p className="muted" aria-live="polite">
        {state.attempt === 2 ? "Reformatting the fit check, attempt 2 of 2" : "Checking fit…"}
      </p>
    );
  }
  if (state.phase === "error") {
    return (
      <p className="error" role="alert">
        {state.message}
      </p>
    );
  }
  if (state.phase === "raw") {
    return (
      <section className="result">
        <p className="notice">
          Unvalidated, check before use. The reply was not in the expected format.
        </p>
        <p className="answer">{state.rawText}</p>
      </section>
    );
  }
  if (!result) return null;
  return (
    <div className="result" aria-live="polite">
      <Card title="Fit check">
        <Result
          result={result}
          suggestion={suggestion}
          onUseResume={onUseResume}
          onRerun={onRerun}
        />
      </Card>
    </div>
  );
}
