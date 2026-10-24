# 0002. Installable as an app (PWA), scoped to /njtransit-bus/

Status: Accepted

## Context

The user wants to install the bus board on their phone's home screen.
study-assistant and churn-machine already do this with `vite-plugin-pwa`
(churn-machine ADR 0004), and that setup works on the user's phones.

## Decision

- Same plugin (generateSW). The manifest's `id`, `scope` and `start_url`
  are `/njtransit-bus/`, and the worker is `/njtransit-bus/sw.js`, so the
  installed app is only this tool. Name "NJ Transit Bus", short name "Bus",
  standalone, portrait, white.
- Only the app shell (JS, CSS, HTML, icons) and Google Fonts are cached.
  Bus times are never cached: the API is cross-origin and not matched by
  any runtime route, so the board always shows live data or "NO SIGNAL".
- Updates: `registerType: 'autoUpdate'` with `skipWaiting` + `clientsClaim`.
  Unlike the other two apps there's no "Update" button: nothing on the board
  can be lost by a reload. `main.tsx` checks for a new version hourly and
  when the app comes back to the foreground.
- Hosting sends `Cache-Control: no-cache` on `/njtransit-bus/**`, like the
  other two installable apps, so update checks always see the newest `sw.js`.
- Icon: white "BUS" in Inter Tight 900 on NJ Transit blue, rendered to PNG
  (192, 512, maskable 512 with the word inside the safe zone, apple-touch
  180) in headless Chromium.

## Consequences

- Opens instantly from the home screen and shows the saved trip; offline it
  still opens (stops and bookmarks are in `localStorage`) but can't show
  buses.
- Checked on the production build (`firebase-tools serve`): the worker
  registers with scope `/njtransit-bus/`, Chrome reports no installability
  errors, and the app opens offline.
