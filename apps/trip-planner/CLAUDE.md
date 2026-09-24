# CLAUDE.md — trip-planner

This file covers `apps/trip-planner` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

A simple trip itinerary keeper: a destination + date range, a day-by-day
itinerary of activities (start/end time, title, description, category —
sightseeing or dining — and free-text tags). Trips are local
(`localStorage`) by default; signing in (Google or email link) and
clicking "Go online" on a trip moves it to Firestore, where it can be
shared — a view-only link (no sign-in needed) or an edit link (recipient
signs in and joins as an editor) — with live multi-editor sync. See
[ADR 0001](docs/adr/0001-trip-planner-local-first-plus-planned-shared-auth-and-sync.md)
(including its 2026-09-24 addendum) for the full design and why the
read-only/edit-link security models differ from each other.

## Architecture notes

- `src/types.ts` — `Trip`/`Activity` shape; a `Trip.cloud` field (owner,
  editors, isShared, editToken) is present only once a trip has been
  moved to Firestore.
- `src/lib/storage.ts` / `src/lib/useTrips.ts` — local persistence, cloud
  persistence, and merging both into one trip list; `useTrips` routes each
  mutation to whichever backend (`localStorage` or Firestore) actually
  owns that trip.
- `src/lib/firebase.ts` — Firebase app/auth/Firestore init. The Firestore
  instance is explicitly bound to the `toolbox-trip-planner` named
  database, not the project's `(default)` one.
- `src/lib/auth.ts` — Google + email-link sign-in. Shared-across-tools by
  design (see the ADR) — not trip-planner-specific internally, just not
  yet extracted into its own package since no second tool needs it.
- `src/lib/cloud.ts` — all Firestore reads/writes/`onSnapshot`
  subscriptions; also where "going online," sharing, and joining as an
  editor live.
- `firestore.rules` — deployed with
  `firebase deploy --only firestore:rules --project vuonghome` (this tool's
  entry in the root `firebase.json`'s `firestore` array). Enforces
  read-only vs. edit access server-side — verified directly against the
  REST API, not just the client UI (see the ADR addendum).
- `src/lib/exportImport.ts` — JSON export (all trips, one file) and import
  (validated with runtime type guards, merged by trip `id`); imported
  trips always land as local-only, never inheriting cloud ownership.
- Editing a trip's date range to add a later end date is how new days get
  added to the itinerary — there's no separate "add a date" control; the
  itinerary view just derives its day sections from the trip's own date
  range each render.

## Running

```bash
npm run dev:trip-planner    # from repo root
npm run build -w apps/trip-planner
```

## Docs

- `docs/adr/` — this tool's own decisions, numbered independently from the
  root and other apps' ADRs.
- `docs/progress/` — this tool's own build/bug-fix log, one file per
  calendar day it was worked on. Read the most recent one at the start of
  a session on this tool.
