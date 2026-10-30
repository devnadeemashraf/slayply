import type { Step } from "../lib/job-steps.js";

export function JobStepper({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`step step-${step.state}`}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span aria-hidden="true">{step.state === "done" ? "✓" : "•"}</span> {step.label}
          {step.state === "done" && <span className="sr-only"> (done)</span>}
        </li>
      ))}
    </ol>
  );
}
