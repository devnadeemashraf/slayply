export type StepperItem<T extends string = string> = {
  id: T;
  label: string;
  state: "done" | "current" | "todo";
  /** With `onSelect`, a step that is not enterable is shown but not clickable. */
  enterable?: boolean;
};

export function JobStepper<T extends string>({
  steps,
  onSelect,
}: {
  steps: readonly StepperItem<T>[];
  onSelect?: (id: T) => void;
}) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((step) => {
        const label = (
          <>
            <span className="step-mark" aria-hidden="true">
              {step.state === "done" ? "✓" : "•"}
            </span>{" "}
            {step.label}
            {step.state === "done" && <span className="sr-only"> (done)</span>}
          </>
        );
        return (
          <li
            key={step.id}
            className={`step step-${step.state}`}
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {onSelect && step.enterable !== false && step.state !== "current" ? (
              <button type="button" className="step-link" onClick={() => onSelect(step.id)}>
                {label}
              </button>
            ) : (
              label
            )}
          </li>
        );
      })}
    </ol>
  );
}
