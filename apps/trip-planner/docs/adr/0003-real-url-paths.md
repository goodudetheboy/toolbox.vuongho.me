# 0003. Real URL paths instead of in-memory views

Status: Accepted

## Context

The app switched views (trip list / new trip / a trip / edit / share) in
React state only, so the URL never changed. The browser back button
therefore skipped straight out of the app to the toolbox homepage, and a
trip couldn't be bookmarked or reloaded.

## Decision

Each view has its own path under Vite's `base`:

| Path | View |
| --- | --- |
| `/trip-planner/` | trip list |
| `/trip-planner/new` | new trip |
| `/trip-planner/trips/:id` | itinerary |
| `/trip-planner/trips/:id/edit` | edit trip / notes |
| `/trip-planner/trips/:id/share` | sharing (owner only) |

Implemented as a ~100-line History-API router (`src/lib/router.ts`), not
react-router — five static routes don't need a dependency. In-app
"back/cancel/done" buttons call `goBack`, which pops history when the
previous entry was pushed by the app (marked `{ inApp: true }` in
`history.state`) and otherwise replaces, so there are no duplicate
entries to click back through.

Share links are now `/trip-planner/trips/:id` (`?edit=<token>` for edit
links). Old `?trip=<id>[&edit=…]` links are rewritten in place on load
(`migrateLegacyTripQuery`), so links already sent keep working.

Deep links need a Hosting fallback: the root `firebase.json` rewrites
`/trip-planner/**` to `/trip-planner/index.html` (toolbox-wide file; rewrites
only apply when no static file matches, so assets are unaffected).

## Consequences

- Back/forward, bookmarks and reloads all work per view.
- The inline "add/edit activity" form is still component state, not a URL —
  it's inline in the day list, not a separate screen.
- Any new route must be added to `parseRoute`/`routePath`.
