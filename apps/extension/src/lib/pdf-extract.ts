import {
  assembleResume,
  itemsToText,
  type PdfTextItem,
  RESUME_MAX_BYTES,
  RESUME_MAX_PAGES,
} from "@slayply/core";

/** The slice of pdf.js used here, so tests can pass the Node build and the panel the browser one. */
export type PdfJs = typeof import("pdfjs-dist");

export type ExtractFailure =
  | "too-large"
  | "too-many-pages"
  | "not-pdf"
  | "corrupt"
  | "encrypted"
  | "no-text"
  | "unreadable"
  | "unavailable";

export type ExtractResult =
  | { ok: true; text: string; truncated: boolean; pageCount: number }
  | { ok: false; reason: ExtractFailure };

export type PdfSource = { size: number; arrayBuffer(): Promise<ArrayBuffer> };

const HEADER = "%PDF-";

function looksLikePdf(bytes: Uint8Array): boolean {
  // The spec allows a little junk before the header; readers accept it within the first KB.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes(HEADER);
}

function isPositioned(
  item: unknown,
): item is { str: string; transform: number[]; width: number; height: number } {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}

/**
 * Reads the text of a resume PDF in the browser. Nothing is uploaded and the PDF is not kept:
 * only the extracted text is returned. Size is checked before any bytes are read.
 */
export async function extractResumeText(
  source: PdfSource,
  loadPdfjs: () => Promise<PdfJs>,
): Promise<ExtractResult> {
  if (source.size > RESUME_MAX_BYTES) return { ok: false, reason: "too-large" };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await source.arrayBuffer());
  } catch {
    // The file was moved or deleted after it was picked.
    return { ok: false, reason: "unreadable" };
  }
  if (bytes.byteLength > RESUME_MAX_BYTES) return { ok: false, reason: "too-large" };
  if (!looksLikePdf(bytes)) return { ok: false, reason: "not-pdf" };

  let pdfjs: PdfJs;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  const task = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await task.promise;
    if (doc.numPages > RESUME_MAX_PAGES) return { ok: false, reason: "too-many-pages" };
    const pages: string[] = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const width = page.getViewport({ scale: 1 }).width;
      // The page box may not start at the origin; make x and y relative to its corner.
      const [originX = 0, originY = 0] = page.view;
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const raw of content.items) {
        if (!isPositioned(raw)) continue;
        items.push({
          str: raw.str,
          x: (raw.transform[4] ?? 0) - originX,
          y: (raw.transform[5] ?? 0) - originY,
          width: raw.width,
          height: raw.height,
        });
      }
      pages.push(itemsToText(items, width));
    }
    const assembled = assembleResume(pages);
    if (!assembled.ok) return assembled;
    return {
      ok: true,
      text: assembled.text,
      truncated: assembled.truncated,
      pageCount: doc.numPages,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { ok: false, reason: name === "PasswordException" ? "encrypted" : "corrupt" };
  } finally {
    await task.destroy();
  }
}

/** One plain sentence for the user, per failure. */
export function describeExtractFailure(reason: ExtractFailure): string {
  switch (reason) {
    case "too-large":
      return `That file is over ${RESUME_MAX_BYTES / (1024 * 1024)} MB. Export a smaller PDF.`;
    case "too-many-pages":
      return `That PDF has more than ${RESUME_MAX_PAGES} pages, which is too long for a resume.`;
    case "not-pdf":
      return "That file is not a PDF.";
    case "corrupt":
      return "That PDF could not be read. Try exporting it again.";
    case "encrypted":
      return "That PDF is password protected. Save an unprotected copy and try again.";
    case "no-text":
      return "No text found, so this PDF may be a scan. OCR is not supported; export a PDF with selectable text.";
    case "unreadable":
      return "That file could not be read. Pick it again.";
    case "unavailable":
      return "The PDF reader could not be loaded. Reload the panel and try again.";
  }
}
