# 0003. Upload history stored in IndexedDB, not localStorage

Status: Accepted

## Context

The user wanted to be able to refer back to previously uploaded/redacted
PDFs later. The natural first suggestion was `localStorage`, but that's the
wrong tool for this job: it has a ~5–10MB total quota shared across the
whole origin, is string-only (forcing base64 encoding of binary PDF bytes,
~33% size overhead), and its API is synchronous (blocks the main thread on
read/write). A real PDF — especially a multi-page one — can easily exceed
what's practical to store that way.

## Decision

Store history in **IndexedDB** instead (`src/lib/history.ts`), keeping the
same fully-client-side property this tool is built on
([0001](0001-pdf-redactor-fully-client-side.md)) — it's still "never
leaves the browser," just persisted to disk via a storage API built for
binary data. Each entry (`id`, `filename`, `uploadedAt`, `pageCount`,
`pdfBytes: ArrayBuffer`, `redactions`) is written once on upload, then
updated via a debounced autosave (400ms) as redaction boxes are
added/removed, so reopening a past entry resumes exactly where editing
left off.

Because this tool exists specifically to handle sensitive documents (the
kind of PDF someone runs through a redactor), persisting the *original,
unredacted* file to disk indefinitely is a real trade-off, not a free
convenience. Mitigated by making deletion a first-class, visible part of
the History UI: delete any single entry, or clear everything — not just a
theoretical "you could clear site data" affordance.

## Consequences

- No practical size limit for personal use (IndexedDB quotas are typically
  hundreds of MB to low GB, browser-dependent), and no base64 bloat or
  main-thread blocking.
- History survives page reloads/browser restarts (verified manually:
  reload after upload, entry still listed) — a real difference from
  in-memory-only state.
- The privacy trade-off is explicit in the UI copy ("Stored only on this
  device — never uploaded anywhere") and backed by working delete/clear
  actions, not just documentation.
- If a future tool needs simple key-value flags (a UI preference, a
  one-time dismissed-banner flag), `localStorage` is still the right/
  simpler choice for *that* — this ADR is about binary document storage
  specifically, not a blanket rule against `localStorage` everywhere.
