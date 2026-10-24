# CLAUDE.md — njtransit-bus

This file covers `apps/njtransit-bus` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

Pick a home stop and a destination stop once; after that the app opens
straight on a board showing when the next NJ Transit bus between them
leaves: one giant countdown, then scroll (snaps) for every bus as
alternating blue/white tiles. The flip button swaps direction; heading back
inverts the colors (white on blue) with a full-screen color wipe. Leaving
from the Port Authority Bus Terminal shows the gate. Buses NJ Transit isn't
tracking yet are clearly marked as timetable times (dashed SCHEDULED box,
clock time instead of minutes, dashed SCHED tags). No sign-in; the two
stops are kept in `localStorage`. Design: the "Bus Times" canvas
(https://claude.ai/artifact/2ZKFR8krERRtBT9vLmYN8L). Full design and data
notes: [ADR 0001](docs/adr/0001-njtransit-bus-architecture.md).

## Layout

- `api/` — Cloud Run service `toolbox-njtransit-bus-api` (plain Node, its
  own `package.json`; **not** an npm workspace). Holds the NJ Transit
  developer login (Secret Manager: `njtransit-bus-username`,
  `njtransit-bus-password`). `npm test` inside `api/`.
  - `njt.js` — NJ Transit API client: login tokens (one per API, BUSDV2 and
    GTFSG2), `getGTFS` zip download, `getBusDV` live departures.
  - `gtfs.js` — timetable zip → compact in-memory indexes: stop search,
    nearest stops, and "which trips go from near A to near B, when".
  - `time.js` — New York time ↔ epoch ms, GTFS service days, BUSDV2 times.
  - `index.js` — HTTP: `GET /stops?q=` or `?lat=&lon=`, `GET /departures?from=&to=`,
    `GET /health` (not `/healthz`: Cloud Run swallows that path).
- `src/screens/Setup.tsx` — the two stop pickers (search or NEAR ME).
- `src/screens/Board.tsx` — the board: hero, tiles, flip + wipe, polling (20 s).
- `src/lib/api.ts`, `saved.ts` (localStorage), `format.ts` (NY clock, gate text).
- `src/styles.css` — all styling; two colors, `--bg`/`--fg` swapped by `.back`.

## Running

```bash
# API (needs the NJ Transit login; takes ~6 s to load the timetable)
cd apps/njtransit-bus/api && npm install
NJT_USERNAME=… NJT_PASSWORD=… node index.js      # http://localhost:8080
# App, from the repo root (talks to localhost:8080 in dev)
npm run dev:njtransit-bus
npm run build -w apps/njtransit-bus
```

The login is the user's NJ Transit developer account; read it from Secret
Manager (`gcloud secrets versions access latest --secret njtransit-bus-password --project vuonghome`),
never commit it.

## Docs

- `docs/adr/` — this tool's own decisions, numbered independently.
- `docs/progress/` — this tool's own build log, one file per calendar day.
