import { LIMITS } from "@slayply/core";
import { useState } from "react";
import type { PastAnswer } from "../lib/past-answers.js";
import type { QuestionRow } from "../lib/question-rows.js";

export type QuestionListProps = {
  rows: readonly QuestionRow[];
  running: boolean;
  onChange: (id: string, patch: Partial<Omit<QuestionRow, "id">>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onGenerateOne: (id: string) => void;
  onGenerateAll: () => void;
  /** Earlier answers to a similar question (from saved jobs); omit to show none. */
  pastFor?: (rowId: string) => readonly PastAnswer[];
  /** Copies the text; the button shows "Copied" when this resolves. */
  onUsePast?: (text: string) => Promise<void> | void;
};

/** The questions to answer: tick, edit, set a limit, generate one or all of the ticked ones. */
export function QuestionList(props: QuestionListProps) {
  const { rows, running } = props;
  const pastFor = props.pastFor ?? (() => []);
  const [copiedPast, setCopiedPast] = useState<string | null>(null);
  const selected = rows.filter((row) => row.checked && row.text.trim() !== "").length;
  const label = `Generate ${selected} answer${selected === 1 ? "" : "s"}`;

  return (
    <div>
      <h3>Questions</h3>
      {rows.length === 0 && (
        <p className="muted">
          No questions yet. Capture a page with an application form, or add one. Questions that load
          on a later step can be added when you get there.
        </p>
      )}
      <ul className="questions">
        {rows.map((row, index) => (
          <li key={row.id}>
            <label htmlFor={`${row.id}-on`}>
              <input
                id={`${row.id}-on`}
                type="checkbox"
                checked={row.checked}
                onChange={(event) => props.onChange(row.id, { checked: event.target.checked })}
              />{" "}
              {`Question ${index + 1}`}
            </label>
            <textarea
              aria-label={`Text of question ${index + 1}`}
              rows={1}
              maxLength={LIMITS.questionChars}
              value={row.text}
              onChange={(event) => props.onChange(row.id, { text: event.target.value })}
            />
            <details className="q-options">
              <summary>
                {row.maxChars ? `Options · up to ${row.maxChars} characters` : "Options"}
              </summary>
              <div className="row">
                <label htmlFor={`${row.id}-max`}>Max characters</label>
                <input
                  id={`${row.id}-max`}
                  type="number"
                  min={1}
                  max={LIMITS.questionMaxChars}
                  value={row.maxChars ?? ""}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    // Zero, negative or blank means no limit; a huge value is held at the contract's cap.
                    props.onChange(row.id, {
                      maxChars:
                        Number.isNaN(value) || value < 1
                          ? null
                          : Math.min(Math.floor(value), LIMITS.questionMaxChars),
                    });
                  }}
                />
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Generate answer for question ${index + 1}`}
                  disabled={running || row.text.trim() === ""}
                  onClick={() => props.onGenerateOne(row.id)}
                >
                  Generate
                </button>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => props.onRemove(row.id)}
                >
                  Remove
                </button>
              </div>
            </details>
            {pastFor(row.id).length > 0 && (
              <details>
                <summary>{`Earlier answer (${pastFor(row.id).length})`}</summary>
                {pastFor(row.id).map((past, pastIndex) => (
                  <div key={`${past.jobId}:${pastIndex}`}>
                    <p className="muted">
                      {[past.title, past.company].filter(Boolean).join(" at ")}
                    </p>
                    <p>{past.text}</p>
                    {props.onUsePast && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          const key = `${row.id}:${pastIndex}`;
                          Promise.resolve(props.onUsePast?.(past.text)).then(
                            () => setCopiedPast(key),
                            () => setCopiedPast(null),
                          );
                        }}
                      >
                        {copiedPast === `${row.id}:${pastIndex}` ? "Copied" : "Copy this answer"}
                      </button>
                    )}
                  </div>
                ))}
              </details>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          type="button"
          className="secondary"
          disabled={rows.length >= LIMITS.maxQuestions}
          onClick={props.onAdd}
        >
          Add question
        </button>
        <button
          type="button"
          disabled={running || selected === 0}
          aria-live="polite"
          onClick={props.onGenerateAll}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
