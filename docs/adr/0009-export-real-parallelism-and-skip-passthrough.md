# 0009. True multi-core export via Web Workers, and skip untouched pages entirely

Status: Accepted

## Context

[0008](0008-export-fast-jpeg-vs-quality-png-parallel.md)'s "parallel" export
pool was concurrent `async`/`await` scheduling on the single JS main
thread — real for I/O-bound waits, but the actual canvas painting for each
page still executed one at a time, since JS is single-threaded and Canvas
2D can't be touched from a Web Worker without `OffscreenCanvas`. Called out
directly by the user ("are u not parallelizing it?"), which was a fair
catch — the naming overstated what the code did.

Separately, every page was being rasterized regardless of whether it had
any redaction boxes on it, which is pure waste: a page with zero boxes has
nothing that needs to be flattened.

## Decision

**Real parallelism**: `apps/pdf-redactor/src/workers/renderWorker.ts` is a
genuine dedicated Web Worker — its own OS thread, its own pdf.js instance,
rendering onto an `OffscreenCanvas` and encoding via
`OffscreenCanvas.convertToBlob`. `exportPdf.ts` spins up a pool sized to
`navigator.hardwareConcurrency` (capped at 8), each worker pulling the next
unprocessed page off a shared queue — actual multi-core work, not
scheduling tricks. Falls back to the old single-thread concurrent-pool path
when `OffscreenCanvas`/`Worker` aren't available (feature-detected).

Each worker parses its **own independent copy** of the PDF bytes (a
transferred `ArrayBuffer` can only go to one recipient, so each worker gets
a `.slice(0)` copy) — a real memory cost, traded for genuine parallel
document access with no shared-state coordination needed.

**Skip untouched pages**: before rendering anything, pages are split into
those with redaction boxes and those without. Untouched pages are copied
directly from the source PDF via `pdf-lib`'s `copyPages` — no rendering, no
encoding, and they keep their original vector text (searchable, smaller,
higher fidelity than before). Only pages that actually have a box on them
go through the render/paint/encode pipeline at all.

## Consequences

- For a typical document (a handful of redacted pages out of many), this
  is a large, compounding win: fewer pages rasterized at all, and the ones
  that are get spread across real CPU cores.
- Verified correctness two ways on a 6-page test doc with boxes on pages 1
  and 3 only: re-parsed the exported PDF with pdf.js and confirmed
  `getTextContent()` is empty on pages 1/3 (rasterized) and returns the
  original marker text on pages 2/4/5/6 (untouched, passed through);
  confirmed the worker script (`renderWorker.ts`) was actually fetched and
  ran (network request observed), not silently skipped to the fallback
  path.
- Memory cost scales with worker count × document size (each worker holds
  its own parsed copy) — capped at 8 workers specifically to bound this on
  high-core-count machines.
- The worker file is excluded from typechecking (`// @ts-nocheck`) because
  mixing DOM and WebWorker lib types in one shared tsconfig causes global
  scope conflicts (`self`) without a proper multi-project TS setup;
  correctness here is verified by running it, not by the type checker.
