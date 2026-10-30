import { charStatus } from "../lib/char-limit.js";

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** A ring that fills toward a character limit. The count and "over" are always written out. */
export function CharRing({ length, max }: { length: number; max: number | undefined }) {
  const status = charStatus(length, max);
  if (!status) return null;
  return (
    <span className={`char-ring char-ring-${status.tone}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="char-ring-track" cx="12" cy="12" r={RADIUS} />
        <circle
          className="char-ring-fill"
          cx="12"
          cy="12"
          r={RADIUS}
          strokeDasharray={`${status.ratio * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        />
      </svg>
      <span>{status.label}</span>
      {status.tone === "bad" && <span> over the limit</span>}
    </span>
  );
}
