# 0002. Google Places API (New) for activity locations

Status: Accepted

## Context

Activities needed a way to find a real place on Google Maps and attach it.
Options: (a) no API — just a "search on Google Maps" link / paste a Maps
URL; (b) Maps JavaScript API with its `PlaceAutocompleteElement` widget;
(c) calling the Places API (New) REST endpoints directly with `fetch`.

(a) can't search inside the app. (b) pulls in the whole Maps JS loader and
a styled web component for what is just a text box + list. (c) is two small
`fetch` calls and styles like the rest of the app.

## Decision

Use the Places API (New) REST endpoints directly from the browser
(`src/lib/places.ts`): `places:autocomplete` while typing, then
`places/{id}` (field mask `id,displayName,formattedAddress,location,googleMapsUri`)
on pick, sharing one session token so Google bills it as one autocomplete
session. The picked place is stored on the activity as `Activity.place`
(name, address, lat/lng, Maps URL) — a snapshot, not re-fetched.

`places.googleapis.com` is enabled on the shared `vuonghome` project, called
with a dedicated browser key ("trip-planner Places (browser)") committed in
source like the Firebase config. It's restricted to only
`places.googleapis.com` and to referrers `https://toolbox.vuongho.me/*`,
the two Hosting default domains, and `http://localhost:{5173,5176,5055}/*`
(a `localhost:*` port wildcard did not match in testing, so ports are
listed explicitly — add one here if a new local port is needed).

## Consequences

- Real per-use cost on the `vuonghome` billing account, covered by Google's
  monthly free tier at personal-use volumes. Referrer restriction is the
  only abuse control; a spoofed Referer header can still spend quota, so
  set a quota cap on the Places API if that ever matters.
- Stored places are snapshots: if a business moves/renames, the activity
  keeps the old data until re-picked.
- No map rendering — the card links out to Google Maps.
