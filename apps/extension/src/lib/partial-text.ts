// Compiled once; the pattern has no nested quantifiers.
const TEXT_KEY = /"text"\s*:\s*"/;
const LOW_SURROGATE_ESCAPE = /^\\u([dD][c-fC-F][0-9a-fA-F]{2})/;
const HEX4 = /^[0-9a-fA-F]{4}$/;

const SIMPLE_ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  "/": "/",
  "\\": "\\",
  '"': '"',
};

/**
 * Reads the first `"text"` string out of a partly received JSON reply so the panel can show a
 * live preview. It decodes escapes, stops at the closing quote, and never returns half of an
 * escape sequence. The result is a preview only: the final answer comes from validation.
 */
export function extractAnswerPreview(buffer: string): string {
  const key = TEXT_KEY.exec(buffer);
  if (!key) return "";

  let out = "";
  let i = key.index + key[0].length;
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '"') return out;
    if (ch !== "\\") {
      out += ch;
      i += 1;
      continue;
    }

    const next = buffer[i + 1];
    if (next === undefined) return out;
    if (next !== "u") {
      out += SIMPLE_ESCAPES[next] ?? "";
      i += 2;
      continue;
    }

    const hex = buffer.slice(i + 2, i + 6);
    if (hex.length < 4) return out;
    if (!HEX4.test(hex)) {
      i += 2;
      continue;
    }
    const code = Number.parseInt(hex, 16);
    if (code >= 0xd800 && code <= 0xdbff) {
      // A high surrogate needs its low half; wait for it rather than showing a broken character.
      const rest = buffer.slice(i + 6, i + 12);
      if (rest.length < 6) return out;
      const low = LOW_SURROGATE_ESCAPE.exec(rest);
      if (low?.[1]) {
        out += String.fromCharCode(code, Number.parseInt(low[1], 16));
        i += 12;
      } else {
        i += 6;
      }
      continue;
    }
    out += String.fromCharCode(code);
    i += 6;
  }
  return out;
}
