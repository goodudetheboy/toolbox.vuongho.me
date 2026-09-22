# CLAUDE.md — pdf-redactor

This file covers `apps/pdf-redactor` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

Upload a PDF, draw black boxes over sensitive content, export a new PDF.
Fully client-side, no backend — see [ADR 0001](docs/adr/0001-pdf-redactor-fully-client-side.md).
Every step (parsing, rasterizing, drawing, rebuilding) happens in the
browser; the uploaded PDF never leaves the user's machine.

## Architecture notes

- `pdfjs-dist` renders PDF pages to canvas; `pdf-lib` rebuilds the exported
  PDF; redaction rectangles are hand-rolled Canvas + pointer events, stored
  in normalized `[0,1]` page-fraction coordinates — see
  [ADR 0002](docs/adr/0002-pdf-redactor-library-choices.md).
- Upload history persists in IndexedDB (`src/lib/history.ts`), not
  `localStorage` — binary PDF bytes don't fit `localStorage`'s quota/string
  model. See [ADR 0003](docs/adr/0003-local-history-via-indexeddb.md).
- Export renders each page through a Web Worker pool
  (`src/workers/renderWorker.ts`) for real multi-core parallelism, and
  skips rasterizing any page with zero redaction boxes on it (copied
  through via `pdf-lib`'s `copyPages` instead) — see
  [ADR 0004](docs/adr/0004-export-fast-jpeg-vs-quality-png-parallel.md) and
  [ADR 0005](docs/adr/0005-export-real-parallelism-and-skip-passthrough.md).
  **This worker path has shipped a real production-only crash before**
  (dev mode passed, the production bundle didn't) — see 0005's addendum
  and the root `CLAUDE.md`'s "test the production build" rule before
  touching anything here.
- Export resolution matches a scanned page's native image DPI when
  detectable, otherwise a lower fixed default for vector/text pages — see
  [ADR 0006](docs/adr/0006-export-resolution-match-native-or-lower-default.md).
- Every exported page has its `/Annots` entries stripped, even passthrough
  pages that were never touched — see
  [ADR 0007](docs/adr/0007-strip-annotations-from-every-exported-page.md);
  this closed a real hidden-annotation leak, not a theoretical one.

## Running

```bash
npm run dev:pdf-redactor    # from repo root
npm run build -w apps/pdf-redactor
```

## Docs

- `docs/adr/` — this tool's own decisions, numbered independently from the
  root and other apps' ADRs.
- `docs/progress/` — this tool's own build/bug-fix log, one file per
  calendar day it was worked on. Read the most recent one at the start of
  a session on this tool.
