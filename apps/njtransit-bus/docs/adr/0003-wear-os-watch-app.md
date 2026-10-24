# 0003. Wear OS watch app: native tile + small app on the same API

Date: 2026-10-24

## Context

The user wants to see the next bus on their Galaxy Watch (Wear OS). Wear OS
has no PWA support (no Chrome, no install-to-home-screen, and a web page
can't be a tile or complication), so the web app can't simply be reused there.
A glance from the watch face needs a native tile.

## Decision

- `wear/`: a native Kotlin app (Compose for Wear OS + Tiles/ProtoLayout),
  not an npm workspace, built with its own Gradle wrapper.
- Reuse by sharing the backend, not UI code: it calls the same
  `toolbox-njtransit-bus-api` (`/departures`, `/stops`), so the timetable, live
  matching and the "in N mins" countdown (ADR 0001) are the same as the web
  app's. `Format.kt`/`Store.kt`/`Api.kt` mirror `src/lib/format.ts`,
  `saved.ts`, `api.ts`; keep them in step when those change.
- **Tile** (`NextBusTile`): next bus big (minutes + "LEAVES h:mm" when tracked,
  clock + SCHEDULED otherwise), gate, the bus after. Fetches on every tile
  request (freshness 2 min); the minutes count down on the watch in between
  with a ProtoLayout dynamic expression (renderers too old for that show the
  number as fetched). Tap opens the app.
- **App** (`MainActivity`): the same board (20 s refresh while on screen,
  alternating tiles, flip with inverted colors) and a stop picker. Stops are
  picked on the watch, by voice/keyboard search (name or stop number):
  the watch can't read the phone browser's `localStorage`, and a phone→watch
  sync would need server-side storage for one person's two stops.
- Same two colors as the web app (white, NJ Transit blue #005097).
- Distributed as a signed APK, sideloaded (Wear Installer 2 / Bugjaeger from
  the phone, or `adb` over wireless debugging); not on the Play Store, not
  built by CI. The release key lives in Secret Manager
  (`njtransit-bus-wear-keystore` = base64 of the .jks,
  `njtransit-bus-wear-keystore-password`), so later builds install over the
  first one. Lose it and the app has to be uninstalled before reinstalling.

## Consequences

- Two front ends to keep in step for display rules; the data rules live in
  the API only.
- No emulator in the dev container (no `/dev/kvm`), so the watch UI is first
  seen on the real watch.
- No complication yet: Wear OS limits complication updates to every few
  minutes; the tile is the reliable glance.
