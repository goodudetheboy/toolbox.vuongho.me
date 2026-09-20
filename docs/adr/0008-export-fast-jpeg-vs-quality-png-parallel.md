# 0008. Export: Fast (JPEG) vs. Best Quality (PNG), parallelized with progress

Status: Accepted

## Context

Export was slow, especially on larger documents: [0005](0005-pdf-redactor-library-choices.md)
established PNG-only, one page rendered/encoded/embedded at a time, at 150
DPI. PNG's lossless encoding is CPU-heavy, sequential processing means
total time scales linearly with page count, and the UI gave no feedback
beyond a static "Exporting…" — on a 17+ page document this reads as hung,
not slow.

## Decision

- **Two export buttons**: "Fast Export" (JPEG, quality 0.92) and "Best
  Quality" (PNG, unchanged from 0005). JPEG encoding is meaningfully
  cheaper than PNG's deflate compression. This does **not** weaken the
  redaction guarantee — the black box is drawn as fully opaque pixels onto
  the canvas *before* encoding either way, so there is nothing under it for
  JPEG's compression to leak; the only trade-off is a theoretical faint
  softness right at a box's edge, not the box's content.
- **Concurrency-limited parallel pipeline** (`apps/pdf-redactor/src/lib/exportPdf.ts`):
  a worker-pool of 4 processes pages concurrently (render → paint redactions
  → encode) instead of one at a time, then pages are assembled into the
  output PDF in order once all are ready. Capped at 4 rather than unbounded
  `Promise.all` over every page, to avoid spiking memory on very large
  documents (each rendered page at 150 DPI is several MB of raw pixels).
- **Live progress** (`onProgress(done, total)` callback) surfaced in the
  toolbar as "Exporting X/Y…", updated as each page completes.

## Consequences

- Meaningfully faster wall-clock export time, more so for Fast/JPEG than
  for Best Quality/PNG (PNG's encode cost dominates either way; parallelism
  helps both, format choice mainly helps PNG's specific bottleneck).
- Users who need pixel-perfect box edges (e.g. printing) still have Best
  Quality; Fast is the sensible new default recommendation for
  screen-reading/emailing use.
- Verified manually: Fast Export's output PDF contains `/Filter
  /DCTDecode` (JPEG) image objects; Best Quality's contains none — the
  format switch actually takes effect, not just a label change. Progress
  text observed advancing (4→12 of 30) mid-export on a 30-page test
  document, confirming the pool genuinely processes multiple pages
  concurrently rather than reporting a fake/simulated progress bar.
