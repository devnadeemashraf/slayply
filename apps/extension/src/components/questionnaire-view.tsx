import {
  type ContextAnswers,
  OPTION_LABELS,
  type QuestionDef,
  type QuestionnaireSection,
} from "@slayply/core";
import { getAt, type Path, type SectionProgress } from "../lib/questionnaire-state.js";

/**
 * Plain, controlled views for the questionnaire. They hold no state and call no storage: the
 * panel passes values in and receives changes out, so these render the same on the server
 * (`renderToString`) as in the side panel.
 */

export type FormHandlers = {
  onChange: (path: Path, value: unknown) => void;
  onBlur: () => void;
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
  onMoveEntry: (index: number, delta: -1 | 1) => void;
  onAddGroupItem: (path: Path, max: number) => void;
  onRemoveGroupItem: (path: Path, index: number) => void;
};

type FieldProps = {
  question: QuestionDef;
  base: Path;
  answers: ContextAnswers;
  errors: Record<string, string>;
  handlers: FormHandlers;
};

const idFor = (path: Path) => `q-${path.join("-")}`;
const keyFor = (path: Path) => path.join(".");

function optionsOf(question: QuestionDef): Array<[string, string]> {
  const labels = question.options
    ? (OPTION_LABELS[question.options] as Record<string, string>)
    : {};
  return Object.entries(labels);
}

function Field({ question, base, answers, errors, handlers }: FieldProps) {
  const path: Path = [...base, question.path];
  const id = idFor(path);
  const error = errors[keyFor(path)];
  const value = getAt(answers, path);
  const describedBy = [error ? `${id}-error` : "", `${id}-help`].filter(Boolean).join(" ");
  const common = {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    onBlur: handlers.onBlur,
  };
  const label = (
    <label htmlFor={id}>
      {question.label}
      {question.required ? " (needed to use this entry)" : ""}
    </label>
  );
  const help = (
    <p className="muted" id={`${id}-help`}>
      {question.help}
      {question.example ? ` Example: ${question.example}` : ""}
    </p>
  );
  const message = error && (
    <p className="error" id={`${id}-error`} role="alert">
      {error}
    </p>
  );

  if (question.group) {
    const { maxItems, questions } = question.group;
    const items = (Array.isArray(value) ? value : []) as unknown[];
    return (
      <fieldset>
        <legend>{question.label}</legend>
        {help}
        {items.map((_, index) => (
          <fieldset key={`${keyFor(path)}-${index}`}>
            <legend>{`${question.label.replace(/s$/, "")} ${index + 1}`}</legend>
            {questions.map((q) => (
              <Field
                key={q.path}
                question={q}
                base={[...path, index]}
                answers={answers}
                errors={errors}
                handlers={handlers}
              />
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => handlers.onRemoveGroupItem(path, index)}
            >
              {`Remove ${question.label.replace(/s$/, "").toLowerCase()} ${index + 1}`}
            </button>
          </fieldset>
        ))}
        {items.length < maxItems && (
          <button
            type="button"
            className="secondary"
            onClick={() => handlers.onAddGroupItem(path, maxItems)}
          >
            {`Add ${question.label.replace(/s$/, "").toLowerCase()}`}
          </button>
        )}
      </fieldset>
    );
  }

  switch (question.control) {
    case "longtext":
      return (
        <div>
          {label}
          <textarea
            {...common}
            rows={3}
            maxLength={question.maxChars}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => handlers.onChange(path, event.target.value)}
          />
          {help}
          {message}
        </div>
      );
    case "list":
      return (
        <div>
          {label}
          <textarea
            {...common}
            rows={3}
            value={Array.isArray(value) ? value.join("\n") : ""}
            onChange={(event) =>
              handlers.onChange(
                path,
                event.target.value === ""
                  ? []
                  : event.target.value
                      .split("\n")
                      .map((line) => line.slice(0, question.maxChars ?? line.length)),
              )
            }
          />
          <p className="muted" id={`${id}-help`}>
            One per line, up to {question.maxItems ?? 0}. {question.help}
            {question.example ? ` Example: ${question.example}` : ""}
          </p>
          {message}
        </div>
      );
    case "select":
      return (
        <div>
          {label}
          <select
            {...common}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => handlers.onChange(path, event.target.value)}
          >
            <option value="">Not answered</option>
            {optionsOf(question).map(([optionValue, optionLabel]) => (
              <option key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            ))}
          </select>
          {help}
          {message}
        </div>
      );
    case "multiselect": {
      const chosen = (Array.isArray(value) ? value : []) as string[];
      return (
        <fieldset>
          <legend>{question.label}</legend>
          {optionsOf(question).map(([optionValue, optionLabel]) => (
            <label key={optionValue} className="check">
              <input
                type="checkbox"
                checked={chosen.includes(optionValue)}
                onChange={(event) => {
                  handlers.onChange(
                    path,
                    event.target.checked
                      ? [...chosen, optionValue]
                      : chosen.filter((v) => v !== optionValue),
                  );
                  handlers.onBlur();
                }}
              />
              {optionLabel}
            </label>
          ))}
          {help}
          {message}
        </fieldset>
      );
    }
    case "number":
      return (
        <div>
          {label}
          <input
            {...common}
            type="number"
            min={0}
            value={typeof value === "number" ? value : ""}
            onChange={(event) =>
              handlers.onChange(
                path,
                event.target.value === "" ? undefined : Number(event.target.value),
              )
            }
          />
          {help}
          {message}
        </div>
      );
    case "month":
      return (
        <div>
          {label}
          <input
            {...common}
            type="month"
            value={typeof value === "string" ? value : ""}
            onChange={(event) => handlers.onChange(path, event.target.value)}
          />
          {help}
          {message}
        </div>
      );
    default:
      return (
        <div>
          {label}
          <input
            {...common}
            type="text"
            maxLength={question.control === "monthOrPresent" ? 7 : question.maxChars}
            placeholder={question.control === "monthOrPresent" ? "YYYY-MM or present" : undefined}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => handlers.onChange(path, event.target.value)}
          />
          {help}
          {message}
        </div>
      );
  }
}

function entrySummary(section: QuestionnaireSection, entry: Record<string, unknown>): string {
  const pick = (key: string) => (typeof entry[key] === "string" ? (entry[key] as string) : "");
  const parts =
    section.id === "experience"
      ? [pick("title"), pick("company")]
      : [pick("name") || pick("title") || pick("institution")];
  return parts.filter(Boolean).join(" at ");
}

export function SectionForm({
  section,
  answers,
  errors,
  handlers,
}: {
  section: QuestionnaireSection;
  answers: ContextAnswers;
  errors: Record<string, string>;
  handlers: FormHandlers;
}) {
  const sectionData = (answers as unknown as Record<string, unknown>)[section.id];
  const header = (
    <>
      <h3>{section.title}</h3>
      <p>{section.intro}</p>
      <p className={section.id === "private" || section.id === "neverClaim" ? "notice" : "muted"}>
        {section.privacy}
      </p>
    </>
  );

  if (!section.repeatable) {
    return (
      <div>
        {header}
        {section.questions.map((q) => (
          <Field
            key={q.path}
            question={q}
            base={[section.id]}
            answers={answers}
            errors={errors}
            handlers={handlers}
          />
        ))}
      </div>
    );
  }

  const entries = (Array.isArray(sectionData) ? sectionData : []) as Array<Record<string, unknown>>;
  const { entryLabel, maxEntries, hint } = section.repeatable;
  return (
    <div>
      {header}
      <p className="muted">{hint}</p>
      {entries.length === 0 && <p className="muted">No entries yet.</p>}
      {entries.map((entry, index) => {
        const summary = entrySummary(section, entry);
        return (
          <fieldset key={String(entry.entryId)}>
            <legend>{`${entryLabel} ${index + 1}${summary ? `: ${summary}` : ""}`}</legend>
            {section.questions.map((q) => (
              <Field
                key={q.path}
                question={q}
                base={[section.id, index]}
                answers={answers}
                errors={errors}
                handlers={handlers}
              />
            ))}
            <div className="row">
              <button
                type="button"
                className="secondary"
                disabled={index === 0}
                onClick={() => handlers.onMoveEntry(index, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="secondary"
                disabled={index === entries.length - 1}
                onClick={() => handlers.onMoveEntry(index, 1)}
              >
                Move down
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => handlers.onRemoveEntry(index)}
              >
                {`Remove ${entryLabel.toLowerCase()} ${index + 1}`}
              </button>
            </div>
          </fieldset>
        );
      })}
      {entries.length < maxEntries && (
        <button type="button" onClick={handlers.onAddEntry}>
          {`Add ${entryLabel.toLowerCase()}`}
        </button>
      )}
    </div>
  );
}

export function StepNav({
  progress,
  current,
  onSelect,
}: {
  progress: SectionProgress[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const done = progress.filter((p) => p.filled).length;
  return (
    <div>
      <p className="muted" role="status">
        {`Step ${current + 1} of ${progress.length}. ${done} of ${progress.length} sections have answers.`}
      </p>
      <label htmlFor="questionnaire-step">Section</label>
      <select
        id="questionnaire-step"
        value={current}
        onChange={(event) => onSelect(Number(event.target.value))}
      >
        {progress.map((p, index) => (
          <option key={p.id} value={index}>
            {`${p.hasErrors ? "! " : p.filled ? "✓ " : ""}${p.title}${p.entries ? ` (${p.entries})` : ""}`}
          </option>
        ))}
      </select>
      <div className="row">
        <button
          type="button"
          className="secondary"
          disabled={current === 0}
          onClick={() => onSelect(current - 1)}
        >
          Back
        </button>
        <button
          type="button"
          className="secondary"
          disabled={current === progress.length - 1}
          onClick={() => onSelect(current + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
