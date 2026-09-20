# 0010. Export resolution: match embedded image's native DPI, or a lower default for text

Status: Accepted

## Context

User asked why exported images were bloated and whether rendering could
match "the PDF's resolution." The real answer is nuanced: vector/text
content has no native resolution at all (that's what vector means), so
there's nothing to "match" for a typical text page — the bloat there comes
from flattening any page to a raster image at all, not from picking the
wrong DPI. [0005](0005-pdf-redactor-library-choices.md)'s fixed 150 DPI was
arbitrary either way.

Where matching *does* apply: a page whose content is essentially one
full-page scanned image genuinely has a native resolution. Rendering that
at a different, unrelated fixed DPI either uselessly upscales a low-res
scan (bigger file, no real detail added) or discards resolution from a
high-res one for no reason.

## Decision

`apps/pdf-redactor/src/lib/renderScale.ts` replaces the fixed export DPI
with `resolvePageScale(page)`:

- Inspects the page's operator list for image-paint operations
  (`OPS.paintImageXObject`/`paintImageXObjectRepeat`). If there's exactly
  one referenced image and its aspect ratio is within 15% of the page's,
  treat it as a full-page scan and compute DPI from the embedded image's
  actual pixel dimensions (`imageWidthPx / pageWidthInPoints * 72`),
  clamped to 72–200 DPI (don't blindly match an absurdly high-res source
  either — that would just reintroduce the bloat problem from the other
  direction).
- Otherwise (no image, multiple images, or an image that's clearly not
  full-page — a small photo/logo on a text page), fall back to a fixed
  **100 DPI** default for vector/text content — down from the old 150,
  since pixel count (and file size) scales with DPI², so this alone
  roughly halves output size for typical text-heavy redacted pages.

Both the Worker-pool export path and the main-thread fallback path call
this same function per page before rendering.

## Consequences

- Verified with two synthetic test PDFs: a pure-text page resolves to
  exactly 100 DPI (`scale = 1.3889`); a page with one 800×600px image
  filling a 400×300pt page resolves to exactly 144 DPI
  (`800 / (400/72) = 144`), matching the source image's real resolution
  precisely rather than an arbitrary constant.
- Scanned documents get their real resolution respected instead of a
  one-size-fits-all constant; text-heavy documents get smaller exports by
  default.
- Detection is a **heuristic**, not a full PDF content-stream interpreter:
  it only recognizes the "one image spans the page" case. Pages with a
  small inline photo alongside text, multiple tiled images, or an image
  under a complex transform all fall through to the 100 DPI default rather
  than attempting (and potentially getting wrong) a partial match — a
  deliberate choice to fail toward the safe, already-working default
  rather than a fragile guess.
