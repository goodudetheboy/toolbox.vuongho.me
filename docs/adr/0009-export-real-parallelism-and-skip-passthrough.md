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

## Addendum: production-only crash, fixed

This shipped with a real bug that only surfaced on the deployed production
build, not the Vite dev server used to verify it here originally — see
`docs/progress/` for the incident. Root causes, both inside pdf.js itself
when run inside a Worker (not our worker's own logic):

1. pdf.js's normal nested-worker spawn path unconditionally reads
   `window.location`, which doesn't exist inside a Worker. This throws
   every time, and pdf.js catches it and falls back to "fake worker" mode
   (parsing runs directly in the calling thread) — which is actually the
   architecture we want here, no further worker needed. But some other
   internal pdf.js code path still reads `GlobalWorkerOptions.workerSrc`
   directly and throws `No "GlobalWorkerOptions.workerSrc" specified` if
   it's unset, even though the nested worker it would point to is never
   actually used. Fix: set it anyway.
2. The fake-worker path's default `CanvasFactory` calls
   `document.createElement('canvas')` — `document` doesn't exist in a
   Worker either. Fixed by passing a custom `CanvasFactory` to
   `getDocument()` that creates `OffscreenCanvas` instances instead.
   `disableFontFace: true` sidesteps an analogous DOM assumption for
   custom embedded fonts (browser `FontFace` registration is main-thread
   only); pdf.js falls back to its own internal glyph rendering.

Why dev mode didn't catch it: unclear exactly which code path differs, but
Vite's dev server serves pdf.js as live unbundled ESM while the production
build is a single minified chunk, and something in that difference changed
which branch got hit. The real lesson: **test the actual production
build** (`npm run build && npm run combine && npx firebase-tools serve`,
not just `npm run dev`) for anything Worker/module-loading-sensitive before
pushing — dev-mode success does not guarantee production-mode success
here, and this repo's normal workflow hadn't been doing that.
