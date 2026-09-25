# 0006. Homepage as a 3D garage toolbox (three.js + cannon-es)

Status: Accepted

## Context

The homepage was a plain list of tool cards. The user wanted it redesigned
as a realistic 3D scene: a closed toolbox on a garage workbench that opens
when clicked, with each tool represented as a physical object inside it,
and with physics.

Options considered for the stack:

- **React Three Fiber / drei** — nicer React ergonomics, but an extra
  abstraction layer and dependency surface for a single scene.
- **Plain three.js driven from one class, mounted by React** — chosen. The
  scene is one imperative object with its own loop; React only owns the
  overlay UI (title, hover card, hints, list view).

Physics: **cannon-es** over Rapier. Rapier is faster (WASM + SIMD), but we
have ~10 bodies, and cannon-es is pure JS: no async WASM init, nothing to
serve, and no interaction with the COOP/COEP headers other tools on this
site need.

## Decision

- `apps/homepage/src/scene/ToolboxScene.ts` owns renderer, camera, physics
  world, input and the frame loop. It is **lazy-loaded** (`import()`), so
  the page shell renders immediately and the ~300 KB gzip three.js chunk
  loads after.
- Realism comes from standard PBR practice rather than downloaded assets:
  IBL from three's `RoomEnvironment` via PMREM (low intensity), AgX tone
  mapping, a `RectAreaLight` shop light plus a co-located soft-shadow spot,
  a warm low "window" sun, GTAO ambient occlusion (desktop only), and
  procedurally generated canvas textures (concrete, butcher-block, block
  wall, pegboard, worn powder-coat with scratches in the metalness map).
  No image/HDR/model files are shipped.
- The lid is not a cannon body: its hinge is a small hand-written
  rigid-body ODE (gravity torque about the hinge, stay-strap stop,
  restitution, friction), which is more controllable than a cannon hinge
  motor and still reads as physical. Its pose drives a kinematic collider
  so tools can't pass through it.
- Tools are dynamic cannon bodies on the foam insert: you can drag them
  (point-to-point constraint), the lid slam rattles them, and closing the
  box tweens anything displaced back to its slot first.
- `apps/homepage/src/tools.ts` is the single tool registry; each entry picks
  a `model` (`marker`, `microphone`, `compass`, fallback `wrench`) so a new
  tool shows up in the box even without a bespoke prop.
- Accessibility/fallbacks: a "List view" overlay with the old card list,
  the same list as the whole page when WebGL is unavailable, visually
  hidden keyboard-focusable links, `prefers-reduced-motion` honoured.
- Weak GPUs: the loop measures frame time and steps quality down (drop
  AO, then pixel ratio) if frames run over ~30 ms.

## Consequences

- Adding a tool: add it to `tools.ts`; optionally add a prop in
  `scene/models.ts` and a slot in `ToolboxScene.spawnItems`.
- The homepage is now much heavier than a static list (lazy chunk ~1 MB
  minified). Acceptable for a personal site; the list view is one click
  away.
- Visual tuning (light intensities, exposure) was done against a desktop
  GPU render; it can't be judged in software-rendered environments (the
  Claude desktop browser pane uses the Microsoft Basic Render Driver and
  runs it at ~1 fps).

## Addendum 2026-09-25: info on pick-up, list view by default on phones

- Tool info no longer floats next to the object on hover (it never showed
  on touch). Picking a tool up (drag, or press-and-hold ~280 ms) shows it
  in an info panel — right side on desktop, bottom sheet on phones — with
  an "Open" button. A plain click/tap on a tool still opens it directly.
- Touch-primary devices (`pointer: coarse`) default to the list view, and
  the 3D chunk isn't even imported until the visitor taps "Open the garage
  (3D)", to spare phone batteries/GPUs. The choice is remembered in
  `localStorage` (`toolbox.view`). Switching back to the list pauses the
  scene's render loop rather than disposing it.
- List tiles and the info panel use `ToolIcon.tsx`: SVG drawings of the
  same props (marker, microphone, compass, wrench fallback).
