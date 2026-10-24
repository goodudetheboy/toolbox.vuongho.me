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
- Distributed as a signed APK, downloaded from
  `toolbox.vuongho.me/njtransit-bus/watch.apk` (`public/watch.apk`, committed;
  public, which is fine: it only shows public bus times; the service worker's
  navigate fallback skips `.apk` so an installed web app doesn't answer with
  the board), then sideloaded (Wear Installer 2 / Bugjaeger from
  the phone, or `adb` over wireless debugging); not on the Play Store, not
  built by CI (amended below: CI builds it now). The release key lives in Secret Manager
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

## Amendment (2026-10-24): self-update, built by CI

The user wanted it to update itself. Not via Google Play (developer account,
review per update); instead:

- **CI builds it** (deploy.yml, only when `wear/` changed on a push):
  `versionCode` = `git rev-list --count HEAD` (only grows on main), signed with
  the Secret Manager key (`github-actions-deploy` can read those two secrets
  only), and committed back to `public/watch.apk` + `public/watch.json`
  (`{ versionCode, sha256 }`) so every deploy serves the latest build. The step
  never fails the deploy.
- **The app updates itself** (`Updater.kt`): on open and every ~24 h
  (WorkManager), reads `watch.json`; if newer, downloads the APK, checks the
  SHA-256, installs with PackageInstaller (`USER_ACTION_NOT_REQUIRED`). Needs
  "install unknown apps" for itself, once (the board shows ALLOW UPDATES when
  it's missing). The first update asks for a tap, since the sideloading tool
  installed the current copy; after that the app is its own installer of
  record and Android 12+ installs updates silently. Background checks skip
  installs that would need a tap and leave them for the next open.
- Don't hand-build APKs for distribution any more: a local build with the
  default `versionCode` 1 would never be offered as an update.
