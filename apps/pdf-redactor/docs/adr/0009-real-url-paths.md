# 0009. Real URL paths so the back button works

Status: Accepted

## Context

The app was one URL with a `view` state (`upload` / `editing` / `history`).
The browser back button left the tool entirely instead of going from an
open PDF back to the upload screen or history list, and a reload always
dropped you back to an empty upload screen.

## Decision

- Three routes under Vite's `base`, handled by a small History-API router
  (`src/lib/router.ts`, same shape as trip-planner's — the apps share no
  code, see toolbox-wide ADR 0001):
  - `/pdf-redactor/` — upload
  - `/pdf-redactor/history` — history list
  - `/pdf-redactor/doc/<historyId>?page=N` — an open document
- New documents get a short 8-character id (`newDocId()` in
  `src/lib/history.ts`, e.g. `j3z728js`) instead of a 36-char UUID; older
  UUID entries keep working. The **file name is deliberately kept out of
  the URL and the tab title** — both land in browser history, which is
  often cloud-synced, and a redaction tool's file names are frequently
  sensitive. The name is shown on the page only.
- The URL is the source of truth for which document is open. A doc URL
  whose id isn't the loaded one (back/forward, reload, history click) loads
  that entry from IndexedDB (ADR 0003). An upload gets its history id up
  front and pushes its doc URL immediately; the first history write still
  waits until the PDF has loaded.
- Page turns `replaceState` (`?page=N`), not push — Back leaves the
  document rather than stepping back through every page.
- Leaving a document for upload/history keeps it in memory, so Forward
  returns instantly.
- An unknown doc id (deleted entry, link opened on another device — the PDF
  only ever lives in that browser) shows a short message, not a crash.
- Deep links need a Hosting fallback: the root `firebase.json` rewrites
  `/pdf-redactor/**` to `/pdf-redactor/index.html` (toolbox-wide file, same
  as trip-planner's rewrite).

## Consequences

- Back/Forward/reload behave like a normal multi-page site.
- Doc URLs are only meaningful in the browser that has that history entry;
  they are not shareable links (by design — ADR 0001, nothing is uploaded).
