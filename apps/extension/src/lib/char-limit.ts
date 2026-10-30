export type CharStatus = { ratio: number; tone: "ok" | "warn" | "bad"; label: string };

const format = (value: number) => value.toLocaleString("en-US");

/** How full an answer is against its character limit, or null when there is no usable limit. */
export function charStatus(length: number, max: number | undefined): CharStatus | null {
  if (max === undefined || !Number.isFinite(max) || max <= 0) return null;
  const tone = length > max ? "bad" : length * 10 >= max * 9 ? "warn" : "ok";
  return {
    ratio: Math.min(length / max, 1),
    tone,
    label: `${format(length)} / ${format(max)}`,
  };
}
