import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cx } from "./cx.js";

type Shared = { label: string; hint?: string; error?: string };

export type FieldProps =
  | (Shared & { multiline?: false } & Omit<InputHTMLAttributes<HTMLInputElement>, "id">)
  | (Shared & { multiline: true } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">);

export function Field(props: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const { label, hint, error } = props;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  const control = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  };

  let input: ReactNode;
  if (props.multiline) {
    const { label: _l, hint: _h, error: _e, multiline: _m, className, ...rest } = props;
    input = <textarea {...rest} {...control} className={cx("sl-field-control", className)} />;
  } else {
    const { label: _l, hint: _h, error: _e, multiline: _m, className, ...rest } = props;
    input = <input {...rest} {...control} className={cx("sl-field-control", className)} />;
  }

  return (
    <div className="sl-field">
      <label className="sl-field-label" htmlFor={id}>
        {label}
      </label>
      {input}
      {hint && (
        <p id={hintId} className="sl-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="sl-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
