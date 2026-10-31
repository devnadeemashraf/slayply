import { type ReactNode, type RefObject, useEffect, useRef } from "react";

/** Escape is the only key that closes a drawer or popover. */
export function shouldDismiss(key: string): boolean {
  return key === "Escape";
}

/**
 * Where Tab goes in a focus trap of `count` controls, or null to let the browser move focus.
 * `current` is the index of the focused control, or -1 when the dialog itself has focus.
 */
export function nextFocusIndex(count: number, current: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0) return shift ? count - 1 : 0;
  if (!shift && current === count - 1) return 0;
  if (shift && current === 0) return count - 1;
  return null;
}

// Open overlays, innermost last: one Escape closes only the innermost.
const openStack: object[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Closes on Escape (innermost overlay only), and on a press outside `ref` and `trigger` when
 * `outside` is set. Focus goes back to what had it before the overlay opened.
 */
function useDismiss(
  open: boolean,
  onClose: () => void,
  ref: RefObject<HTMLElement | null>,
  outside: boolean,
  trigger?: RefObject<HTMLElement | null>,
) {
  // Callers pass a new function each render; reading it through a ref keeps the effect (and the
  // focus it restores on cleanup) from re-running on every keystroke in a drawer's field.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const token = {};
    openStack.push(token);
    const before = document.activeElement;
    const onKey = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (shouldDismiss(event.key)) closeRef.current();
    };
    const onPress = (event: MouseEvent) => {
      if (!outside || !(event.target instanceof Node)) return;
      if (ref.current?.contains(event.target) || trigger?.current?.contains(event.target)) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPress);
      openStack.splice(openStack.indexOf(token), 1);
      if (before instanceof HTMLElement && document.contains(before)) before.focus();
    };
  }, [open, ref, outside, trigger]);
}

/** A titled block of a screen, with an optional action beside the heading. */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sl-section">
      <div className="sl-section-head">
        <h2 className="sl-section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A sheet from the bottom for details that would otherwise lengthen the screen. */
export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, ref, false);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="sl-drawer-backdrop">
      <div
        ref={ref}
        className="sl-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || !ref.current) return;
          const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
          const target = nextFocusIndex(
            items.length,
            items.indexOf(document.activeElement as HTMLElement),
            event.shiftKey,
          );
          if (items.length === 0) event.preventDefault();
          else if (target !== null) {
            event.preventDefault();
            items[target]?.focus();
          }
        }}
      >
        <div className="sl-section-head">
          <h2 className="sl-section-title">{title}</h2>
          <button type="button" className="sl-icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A small panel beside its trigger; place it inside a `position: relative` parent. Pass the
 * trigger's ref so a press on it toggles the panel instead of closing and reopening it.
 */
export function Popover({
  open,
  label,
  onClose,
  trigger,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  trigger?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, onClose, ref, true, trigger);
  if (!open) return null;
  return (
    <div ref={ref} className="sl-popover" role="dialog" aria-label={label}>
      {children}
    </div>
  );
}
