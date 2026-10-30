import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = "primary", className, type, ...rest }: ButtonProps) {
  // A button inside a form must opt in to submitting; the default is a plain button.
  const kind = type === "submit" || type === "reset" ? type : "button";
  return <button type={kind} className={cx("sl-btn", `sl-btn-${variant}`, className)} {...rest} />;
}
