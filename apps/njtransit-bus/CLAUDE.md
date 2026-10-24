# CLAUDE.md — njtransit-bus

This file covers `apps/njtransit-bus` specifically. For the toolbox as a
whole (repo map, running things, shared infra rules), see the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this tool does

Pick a home stop and a destination stop once; after that the app opens
straight on a board showing when the next NJ Transit bus between them
leaves: one giant countdown, then scroll (snaps) for every bus as
alternating blue/white tiles. The flip button (or a double tap anywhere) swaps direction; heading back
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
    GTFSG2), `getGTFS` zip download, `getBusDV` live departures, and the
    GTFS-realtime feeds (`realtimeFeeds`).
  - `realtime.js` — hand-rolled decoder for GTFS-realtime trip updates and
    vehicle positions; they add the GPS-tracked buses BUSDV2 leaves out
    ([ADR 0004](docs/adr/0004-gtfs-realtime-fills-busdv-gaps.md)).
  - `gtfs.js` — timetable zip → compact in-memory indexes: stop search,
    nearest stops, and "which trips go from near A to near B, when".
  - `time.js` — New York time ↔ epoch ms, GTFS service days, BUSDV2 times.
  - `order.js` — the order buses are shown in (tracked ones win over the timetable).
  - `index.js` — HTTP: `GET /stops?q=` or `?lat=&lon=`, `GET /departures?from=&to=`
    (`&debug=1` for the stats sheet's per-feed details), `GET /health` (not
    `/healthz`: Cloud Run swallows that path). Answers are gzipped: the board
    polls every 20 s on mobile data, so keep poll answers small.
- `wear/` — the Galaxy Watch (Wear OS) app: a tile + small app in Kotlin,
  calling the same API. Own Gradle build; CI builds it when it changes and
  commits it to `public/watch.apk`/`watch.json`, and installed copies update
  themselves (`Updater.kt`).
  See [ADR 0003](docs/adr/0003-wear-os-watch-app.md) and "Watch app" below.
- `src/screens/Setup.tsx` — the two stop pickers (search or NEAR ME).
- `src/screens/Board.tsx` — the board: hero, tiles, flip + wipe, polling (20 s).
- `src/screens/NameSheet.tsx` — name / rename / remove a bookmark (from the
  board's bookmark button or title, or the saved list's pencil).
- `src/screens/Stats.tsx` — the stats sheet behind the nerd-face button at the
  bottom of the list: what each NJ Transit feed said about every bus (from the
  API's `debug` fields), with COPY (the whole response as text) for pasting into a debug session.
- `src/lib/api.ts`, `saved.ts` (localStorage), `format.ts` (NY clock, gate text).
- `src/styles.css` — all styling; two colors, `--bg`/`--fg` swapped by `.back`.
- PWA: `vite-plugin-pwa` config in `vite.config.ts` (scope `/njtransit-bus/`,
  auto-update, bus times never cached), registered in `src/main.tsx`; icons in
  `public/`. See [ADR 0002](docs/adr/0002-installable-pwa.md). Test service
  worker changes on the production build (root `CLAUDE.md`).

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

## Watch app (`wear/`)

CI builds and publishes it (deploy.yml, only when `wear/` changed); just push.
Building locally is for checking that it compiles: needs JDK 17 and the
Android SDK (platform 35, build-tools 35); there's no emulator in the dev
container, so the first check is on the real watch.

```bash
cd apps/njtransit-bus/wear
echo "sdk.dir=$HOME/android/sdk" > local.properties
# release key, so updates install over the old version (never commit these)
gcloud secrets versions access latest --secret njtransit-bus-wear-keystore --project vuonghome | base64 -d > release.jks
PW=$(gcloud secrets versions access latest --secret njtransit-bus-wear-keystore-password --project vuonghome)
printf 'storeFile=release.jks\nstorePassword=%s\nkeyAlias=bus\nkeyPassword=%s\n' "$PW" "$PW" > keystore.properties
./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
```

Don't copy local builds into `public/`: their `versionCode` is 1, so watches
would never take them. CI's builds use the commit count. Download link for a
first install: `toolbox.vuongho.me/njtransit-bus/watch.apk`.
`Api.kt`/`Format.kt`/`Store.kt` mirror `src/lib/`; change them together.

## Docs

- `docs/adr/` — this tool's own decisions, numbered independently.
- `docs/progress/` — this tool's own build log, one file per calendar day.
