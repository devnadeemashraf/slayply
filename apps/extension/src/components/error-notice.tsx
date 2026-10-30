import { Button } from "@slayply/ui";
import { explainError } from "../lib/error-copy.js";

/** A failed generation: says what happened and what to do, with a retry when repeating can help. */
export function ErrorNotice({
  code,
  message,
  onRetry,
  direct = false,
}: {
  code: string;
  message: string;
  onRetry?: (() => void) | undefined;
  /** Direct Mode: advice about choosing another model does not apply. */
  direct?: boolean;
}) {
  const explained = explainError(code, message, direct);
  return (
    <>
      <p className="error" role="alert">
        {explained.message}
      </p>
      {explained.retry && onRetry !== undefined && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </>
  );
}
