# 0005. PDF Redactor: pdfjs-dist + pdf-lib + hand-rolled canvas drawing

Status: Accepted

## Context

Building the redactor client-side (see
[0004](0004-pdf-redactor-fully-client-side.md)) needs: rendering PDF pages
to a rasterizable surface, letting the user draw rectangles on top of a
page, and rebuilding a new PDF from the redacted page images.

## Decision

- **Rendering (PDF → canvas): `pdfjs-dist`** (Mozilla's PDF.js, Apache-2.0).
  No real alternative exists for client-side PDF rasterization.
- **Export (images → new PDF): `pdf-lib`** (MIT). Only a small slice of its
  API is used: `PDFDocument.create()`, `embedPng`, `addPage`, `drawImage`.
  `jsPDF` was considered but has weaker image-embedding/page-sizing
  ergonomics for this exact "flatten raster page into new PDF" case.
- **Redaction rectangle drawing: hand-rolled Canvas + pointer events, no
  library.** v1 scope is rectangles only (draw/undo/clear); a canvas
  library (Konva/Fabric) would add real bundle weight and a new API surface
  for no v1 benefit.
- **Redaction rectangles are stored in normalized `[0,1]` page-fraction
  coordinates**, not pixels — this decouples the interactive editing
  render scale from the (higher) export render scale; the same rectangle
  set is reused when re-rendering a page at export resolution.
- **Export renders each page at 150 DPI, composited to PNG** (not JPEG) —
  PNG avoids any lossy-compression ringing artifacts at a redaction box's
  edges. Since the exported page is a flattened raster image with no text
  layer at all, there is nothing to copy/extract from under a box
  regardless of DPI; DPI only trades off legibility of non-redacted text vs.
  file size. Interactive editing renders at a lower scale purely for UI
  performance.

## Consequences

- No text layer survives into the output PDF — redaction is structurally
  irrecoverable, not just visually covered.
- Output files are somewhat larger than a vector PDF would be (full-page
  PNG per page) — acceptable for a personal tool; swapping to JPEG at high
  quality is a one-function change if size ever becomes a problem.
- v1 has no freehand redaction, OCR-assisted redaction, or text-based
  find-and-redact — only manually drawn rectangles.
