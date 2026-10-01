# 0008. Mobile editing: in-app zoom/pan, Move/Draw mode, bottom bar

Status: Accepted

## Context

On a phone the editor was close to unusable. The page canvas had
`touch-action: none` (needed so drawing doesn't scroll the page), which
also meant you couldn't scroll or pinch-zoom over the page at all — every
one-finger touch drew a box, and a box was only as precise as an unzoomed
fingertip. The preview was a fixed 1.5× bitmap, so even browser zoom would
have been blurry. A drag that slid off the page edge committed the box
early (`pointerleave`), a tap could leave a sliver box, and the controls
were split between a toolbar above the page and page nav below it.

Options for zoom: let the browser pinch-zoom the whole page natively (and
re-render the canvas at `visualViewport.scale`), or zoom inside the app.
Native zoom also magnifies/moves any fixed or sticky controls off screen
and fights the gesture model, so the app handles it.

## Decision

- The page sits in a scroll box (`.page-scroller`); zoom (1×–5×) is the
  inner wrap's CSS width, and all gestures on the page are custom pointer
  handling in `PageCanvas`:
  - Two fingers always pinch-zoom and pan, in either mode, and cancel a
    half-drawn box. Ctrl+wheel / trackpad pinch zooms on desktop.
  - One finger (or mouse drag) does whatever the **Move / Draw** toggle
    says. Touch devices default to Move so scrolling never draws a box;
    mouse devices default to Draw (the previous behavior).
- The preview is re-rendered at displayed size × zoom × devicePixelRatio
  after a pinch settles (debounced, quantized), capped at 10M pixels per
  bitmap — iOS Safari renders a blank canvas past ~16.7M.
- Drawing uses pointer capture (sliding off the page no longer ends the
  box), ignores tap/jitter-sized boxes, and touch selection has ~10px of
  slop. The in-progress and selected boxes are DOM overlays, so dragging
  doesn't redraw a large bitmap every frame.
- All controls live in one sticky bottom bar (`EditorBar`): page nav, the
  mode toggle, Undo, Clear (now confirms), and a single Export button
  opening a Fast / Best quality menu. On ≤640px it's two rows and the page
  box takes the rest of the screen.

Redaction coordinates stay normalized `[0,1]` (ADR 0002), so none of this
touches export.

## Consequences

- Phones can zoom in to redact small text precisely; desktop gains zoom too.
- The page now scrolls inside its own box on desktop as well, instead of
  the whole document scrolling.
- One-finger pan is hand-rolled, so it has no momentum/fling like native
  scrolling.
- Higher-zoom previews use more memory; the pixel cap trades a little
  sharpness at max zoom on big pages for not crashing iOS.
