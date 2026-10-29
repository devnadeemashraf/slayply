# ADR-0009: PDF Resume Parsing and Local Resume Store

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** Nadeem Ashraf
- **Roadmap ID:** `RES-01`

---

## Context and Problem Statement
Answers have been generic because `buildAnswerRequest` sends a no-resume marker. The user needs to upload PDF resumes, tag each with a track and region, keep them on the device, and choose one per answer. Constraints: the PDF is read in the browser and never uploaded (SPEC section 5); the extension must stay under 3.5 MB uncompressed; MV3 allows only `script-src 'self'`; pdf.js returns positioned text items with no reading order, so a two-column resume can come out scrambled.

---

## Decision Drivers
- Reading-order logic is the main quality risk, so it must be testable in Node.
- The worker must be a packaged extension file (no blob, CDN or eval).
- Opening the panel must not get heavier for people who never upload a PDF.
- A resume that cannot be read must fail with a plain reason, never an empty or garbled save.

---

## Considered Options
**Where the logic lives.**
1. **A:** Pure code in `packages/core` (`itemsToText`, `assembleResume`, tag and record schemas); a thin pdf.js wrapper in the extension.
2. **B:** Everything in the extension. Column and scanned-PDF logic cannot be unit tested in Node.
3. **C:** Use pdf.js's own item order only. Interleaves columns.

**Resume IDs.** A counter record (like `F01`) or `crypto.randomUUID()`. Chosen: random, so two windows never share a counter and no stale-counter guard is needed.

---

## Decision Outcome
Chosen: **A, with the modern pdf.js build and random IDs.**

- `packages/core/src/resume.ts`: `itemsToText` groups items into lines by height, finds the widest vertical band in the middle half of the page that at most a few items cross (a centered name may cross it; at least 3% wide, at least five narrow items each side) and reads the left column, then the right. Items that start left of the gutter, including a header, stay in the left stream at their own height, so a header comes first. No gutter means top to bottom. `assembleResume` joins pages, strips control characters, collapses blank runs, reports `no-text` under 50 visible characters, and cuts to `LIMITS.resumeChars` without splitting a surrogate pair.
- `resumeTagSchema` is the same bound as the relay's `resumeSchema` plus no control characters, so a saved tag can never fail a request. Track presets `fde`, `sde`; region presets `master`, `gulf`, `india`, `remote`; both accept a custom name.
- `apps/extension/src/lib/pdf-extract.ts` checks size (5 MB) before reading bytes, the `%PDF-` header before parsing, and page count (20) before extracting. Failures are typed (`too-large`, `too-many-pages`, `not-pdf`, `corrupt`, `encrypted`, `no-text`, `unavailable`) and each has one plain sentence.
- `pdf-loader.ts` imports `pdfjs-dist/build/pdf.min.mjs` and the worker with `?url` only when a file is chosen. Measured on the production build: sidepanel chunk 403 kB, pdf.js chunk 428 kB, worker 1.26 MB, total 2.10 MB of 3.5 MB.
- IndexedDB version 3 adds a `resumes` store (keyPath `id`) without touching the others. Only the extracted text is stored, never the PDF. An unreadable record raises `ResumeCorruptError` and is never overwritten.
- The generate panel has a Resume select ("No resume" by default; the last choice is remembered in `localStorage`, best effort). `buildAnswerRequest` sends the chosen resume's track, region and text; with none it keeps the no-resume marker. Auto-suggesting a resume is `FIT-01`.
- The user sees the file name, page and character counts, a truncation warning and the whole extracted text before saving, and picks the tags.

### Known limits
- Reading order is a heuristic: one gutter, so three columns or a boxed layout may read out of order. The preview is the safety net; there is no in-app text editing yet.
- Scanned PDFs have no text layer. OCR is out of scope.
- CMaps and standard fonts are not bundled, so some CJK PDFs may extract poorly.
- pdf.js v6 has no `isEvalSupported` option, so none is set; the CSP still blocks eval.
- Resume text is up to 100,000 characters and the relay body cap is 500 KB, so a very long resume plus a profile can be refused by the contract check with a "resume not valid" message.

### Consequences
- The extension grows from about 0.4 MB to about 2.1 MB; most of it loads only on upload.
- The worker file is a module worker served from the extension origin. This is verified by the build output, not yet by loading the unpacked extension (manual test).
