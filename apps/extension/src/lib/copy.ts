export type CopyState = "idle" | "copied" | "failed";

/** How long "Copied!" stays on the button. */
export const COPY_FEEDBACK_MS = 2_000;

export type ClipboardLike = { writeText(text: string): Promise<void> };

export async function copyText(
  clipboard: ClipboardLike | undefined,
  text: string,
): Promise<"copied" | "failed"> {
  if (!clipboard) return "failed";
  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Copies and reports `copied` / `failed`, then returns to `idle` after the feedback window. */
export function createCopyFeedback(
  clipboard: ClipboardLike | undefined,
  onState: (state: CopyState) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    async copy(text: string): Promise<void> {
      const outcome = await copyText(clipboard, text);
      clearTimeout(timer);
      onState(outcome);
      timer = setTimeout(() => onState("idle"), COPY_FEEDBACK_MS);
    },
    cancel(): void {
      clearTimeout(timer);
    },
  };
}
