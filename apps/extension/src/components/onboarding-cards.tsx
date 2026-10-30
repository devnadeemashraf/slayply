import { PRIVACY_STATEMENT, TRAINING_WARNING } from "../lib/privacy.js";

const CARDS = [
  { title: "Where your data goes", body: PRIVACY_STATEMENT, notice: false },
  { title: "Before you send anything personal", body: TRAINING_WARNING, notice: true },
] as const;

export const ONBOARDING_LAST_STEP = CARDS.length - 1;

export function OnboardingCards({
  step,
  error,
  onNext,
  onBack,
  onAccept,
}: {
  step: number;
  error?: string | null;
  onNext: () => void;
  onBack: () => void;
  onAccept: () => void;
}) {
  const card = CARDS[Math.min(Math.max(step, 0), ONBOARDING_LAST_STEP)] ?? CARDS[0];
  const last = step >= ONBOARDING_LAST_STEP;

  return (
    <section>
      <p className="muted">{`Before you start (${Math.min(step, ONBOARDING_LAST_STEP) + 1} of ${CARDS.length})`}</p>
      <h2>{card.title}</h2>
      <p className={card.notice ? "notice" : undefined}>{card.body}</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        {step > 0 && (
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
        )}
        {last ? (
          <button type="button" onClick={onAccept}>
            I understand
          </button>
        ) : (
          <button type="button" onClick={onNext}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}
