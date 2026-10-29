import type { PdfJs } from "./pdf-extract.js";

/**
 * Loads pdf.js in the side panel only when a PDF is chosen, so opening the panel stays light.
 * The worker is a packaged extension file (allowed by `script-src 'self'`), never a blob or CDN.
 */
export async function loadPdfjs(): Promise<PdfJs> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/build/pdf.min.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
