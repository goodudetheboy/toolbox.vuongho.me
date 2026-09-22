# CLAUDE.md — trip-planner

This file covers `apps/trip-planner` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

A simple trip itinerary keeper: a destination + date range, a day-by-day
itinerary of activities (start/end time, title, description, category —
sightseeing or dining — and free-text tags). Data is local-only right now
(`localStorage`), with JSON export/import as the interim way to move data
between devices. See
[ADR 0001](docs/adr/0001-trip-planner-local-first-plus-planned-shared-auth-and-sync.md)
for the full planned architecture (shared sign-in, sharing, real-time sync)
and why it's not implemented yet — blocked on Firebase/GCP console access
this session doesn't have, not on remaining engineering work.

## Architecture notes

- `src/types.ts` — `Trip`/`Activity` shape. Deliberately matches the
  planned Firestore document shape (see the ADR) so moving off
  `localStorage` later is additive, not a rewrite.
- `src/lib/storage.ts` / `src/lib/useTrips.ts` — all persistence and CRUD;
  every mutation immediately re-saves the full trip list to `localStorage`.
- `src/lib/exportImport.ts` — JSON export (all trips, one file) and import
  (validated with runtime type guards, merged by trip `id`).
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
