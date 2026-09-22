# 0007. Strip annotations from every exported page

Status: Accepted

## Context

User asked whether export wipes "all metadata." Investigation (verified,
not assumed) found two different answers depending on the layer:

- **Document-level metadata** (Title/Author/Subject/Keywords/dates):
  already fully wiped, as a side effect of [0005](0005-export-real-parallelism-and-skip-passthrough.md)
  building a brand-new `PDFDocument` rather than editing the original —
  none of that gets copied over.
- **Page-level annotations on passthrough pages**: not wiped at all. A
  page with no redaction box is copied structurally via `copyPages`
  ([0005](0005-export-real-parallelism-and-skip-passthrough.md)), which
  preserves everything attached to it — comments, sticky notes,
  hyperlinks, form field widgets — regardless of whether any of that is
  visible when the page renders normally.

Confirmed with a live test: planted a sticky-note annotation containing
`"HIDDEN NOTE: real SSN is 999-99-9999, do not release"` on a page with no
redaction box, exported, and the annotation came through completely
intact — invisible unless someone clicks the note icon or inspects the
file's structure. For a tool whose entire purpose is redaction, that's a
real gap: someone could review the rendered page, see nothing sensitive,
ship the file, and not know a hidden note survived untouched.

## Decision

Strip the `/Annots` entry from every page of the output document — both
rasterized and passthrough — unconditionally, regardless of content:
```ts
for (const outPage of outDoc.getPages()) {
  outPage.node.delete(PDFName.of('Annots'));
}
```
Applied once, after all pages are assembled. Rasterized pages never had
any annotations to begin with (they're freshly created via `addPage`), so
this is a no-op there and only matters for passthrough pages — but running
it unconditionally on every page is simpler and more obviously correct
than tracking which pages need it.

This removes *all* annotation types on a page — comments, links, and form
field widgets alike — not just comment-style ones. Considered stripping
only comment/note annotations and leaving links/forms alone, but a
redaction tool has no way to know in advance whether a hyperlink or a
filled-in form value is itself sensitive, so the safer default is to
remove the whole category.

## Consequences

- Closes a real information-leak path: nothing attached to a page but not
  rendered as part of its visible content can survive export anymore.
- Any legitimate use of annotations (a genuine hyperlink someone wants to
  keep, a form the recipient is meant to still fill in) is lost too — an
  acceptable trade for a tool whose job is to guarantee nothing hidden
  ships, not to preserve document richness.
- Verified live: re-ran the exact same planted-annotation test after the
  fix — the exported PDF has no `/Annots` key on either page at all
  (previously: absent on the rasterized page, present with the hidden
  note intact on the passthrough page). Confirmed document-level metadata
  wiping still holds (regression check, unaffected by this change).
