# 0004. Installable as an app (PWA), scoped to /churn-machine/

Status: Accepted

## Context

The user wants to install Churn Machine as an app. study-assistant already
does this with `vite-plugin-pwa` (its ADR 0001, addendum 2026-10-05), and
that setup works on the user's phones.

## Decision

- Same setup as study-assistant: `vite-plugin-pwa` (generateSW). The
  manifest's `id`, `scope` and `start_url` are `/churn-machine/`, and the
  worker is `/churn-machine/sw.js`, so the installed app is only this tool.
  Name "Churn Machine", short name "Churn", standalone. Shortcuts go to
  Plan and My accounts.
- The app shell (JS, CSS, HTML, icons) is precached. `deals.json` is not
  precached: it's a `NetworkFirst` runtime route (5 s timeout), so it's
  fresh online and still available offline. Deals and planning then work
  with no network. Sign-in and account syncing need the network.
- The runtime route uses a regex literal. The plugin serializes
  `urlPattern` functions into `sw.js` by themselves, so a function that
  referenced the config's `BASE` silently never matched. This was caught by
  an offline test.
- Updates: `registerType: 'prompt'` + `clientsClaim`. `UpdateToast` offers
  "Update" and never reloads on its own, so a half-typed note isn't lost.
  It checks for a new version hourly and when the app comes back to the
  foreground.
- Hosting sends `Cache-Control: no-cache` on `/churn-machine/**`, like
  study-assistant, so update checks always see the newest `sw.js`. This
  replaces the earlier 10-minute cache on `deals.json`; ETags keep repeat
  loads cheap.
- Icon: the homepage's gold coin stack on the app's green (`public/icon.svg`),
  kept inside the maskable safe zone. The PNGs (192, 512, maskable 512,
  apple-touch 180, favicon 48) are rendered from the SVG in headless
  Chromium.
- Google sign-in tries a popup first and falls back to a full-page redirect
  when the popup is blocked, which installed apps on phones often do. Same
  as study-assistant.
- The installed app respects safe areas (notch, home indicator) in
  standalone mode.

## Consequences

- Verified against the production build in headless Chromium:
  `getInstallabilityErrors` is empty with a real profile, and offline a deep
  link to `/plan` opens and plans from the cached deals.
- About 960 KB precached once (mostly Firebase).
