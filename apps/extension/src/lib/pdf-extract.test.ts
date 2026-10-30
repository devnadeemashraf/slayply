import { RESUME_MAX_BYTES, RESUME_MAX_PAGES } from "@slayply/core";
import { describe, expect, it } from "vitest";
import { extractResumeText } from "./pdf-extract.js";
import { buildPdf, type FixtureLine } from "./pdf-fixtures.js";

// Node build of pdf.js; the browser build is loaded by `pdf-loader.ts`.
const loadPdfjs = () => import("pdfjs-dist/legacy/build/pdf.mjs");

function fileOf(bytes: Uint8Array, size = bytes.byteLength) {
  return { size, arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer };
}

const LONG = "Senior engineer who built billing systems and led a team of five";

function lines(...texts: string[]): FixtureLine[] {
  return texts.map((text, i) => ({ text, x: 50, y: 740 - i * 20 }));
}

describe("extractResumeText", () => {
  it("reads text from a one-page PDF", async () => {
    const pdf = buildPdf([lines("Jane Doe", LONG)]);
    const result = await extractResumeText(fileOf(pdf), loadPdfjs);
    expect(result).toEqual({
      ok: true,
      text: `Jane Doe\n${LONG}`,
      truncated: false,
      pageCount: 1,
    });
  }, 30_000);

  it("joins pages in order", async () => {
    const pdf = buildPdf([lines(LONG), lines("Second page: education and skills in detail")]);
    const result = await extractResumeText(fileOf(pdf), loadPdfjs);
    if (!result.ok) throw new Error(result.reason);
    expect(result.pageCount).toBe(2);
    expect(result.text.indexOf("Senior")).toBeLessThan(result.text.indexOf("Second page"));
  });

  it("reads a two-column page left column first", async () => {
    const left = Array.from({ length: 6 }, (_, i) => ({
      text: `Left${i} ${LONG}`,
      x: 40,
      y: 740 - i * 20,
    }));
    const right = Array.from({ length: 6 }, (_, i) => ({
      text: `Right${i} ${LONG}`,
      x: 330,
      y: 740 - i * 20,
    }));
    const result = await extractResumeText(fileOf(buildPdf([[...right, ...left]])), loadPdfjs);
    if (!result.ok) throw new Error(result.reason);
    const out = result.text.split("\n");
    expect(out.slice(0, 6).every((l) => l.startsWith("Left"))).toBe(true);
    expect(out.slice(6).every((l) => l.startsWith("Right"))).toBe(true);
  });

  it("reports a PDF with no text layer (a scan)", async () => {
    const result = await extractResumeText(fileOf(buildPdf([[], []])), loadPdfjs);
    expect(result).toEqual({ ok: false, reason: "no-text" });
  });

  it("rejects an oversized file before reading it", async () => {
    let read = false;
    const file = {
      size: RESUME_MAX_BYTES + 1,
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    };
    expect(await extractResumeText(file, loadPdfjs)).toEqual({ ok: false, reason: "too-large" });
    expect(read).toBe(false);
  });

  it("reports a file that cannot be read after it was picked", async () => {
    const file = { size: 10, arrayBuffer: () => Promise.reject(new Error("gone")) };
    expect(await extractResumeText(file, loadPdfjs)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("rejects too many pages", async () => {
    const pages = Array.from({ length: RESUME_MAX_PAGES + 1 }, () => lines(LONG));
    const result = await extractResumeText(fileOf(buildPdf(pages)), loadPdfjs);
    expect(result).toEqual({ ok: false, reason: "too-many-pages" });
  });

  it("rejects a file that is not a PDF without parsing it", async () => {
    const bytes = new TextEncoder().encode("<html>not a pdf</html>");
    expect(await extractResumeText(fileOf(bytes), loadPdfjs)).toEqual({
      ok: false,
      reason: "not-pdf",
    });
  });

  it("reports a corrupt PDF", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Broken");
    expect(await extractResumeText(fileOf(bytes), loadPdfjs)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("reports a reader that fails to load as unavailable", async () => {
    const pdf = buildPdf([lines(LONG)]);
    const result = await extractResumeText(fileOf(pdf), () => Promise.reject(new Error("offline")));
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});
