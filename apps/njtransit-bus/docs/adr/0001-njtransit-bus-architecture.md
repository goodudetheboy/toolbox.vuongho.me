# 0001. NJ Transit bus board: Cloud Run proxy with the timetable in memory, live times from BUSDV2

Status: Accepted

## Context

The user has an NJ Transit developer account, which opens two APIs on
`pcsdata.njtransit.com` (docs: "BUSDATA Web API V1" and "BUS GTFS/GTFSRT
Web API G2"):

- **BUSDV2** — JSON. `getBusDV` gives a stop's departures over roughly the
  next hour (route, headsign, `departurestatus` like "in 4 mins" / "All
  Aboard" / a plain clock time, `lanegate` at Port Authority, vehicle,
  load, `internal_trip_number`), plus stop/route lookups.
- **GTFSG2** — `getGTFS` (the whole timetable as a ~50 MB GTFS zip, ~1.8 M
  stop_times rows, includes light rail) and GTFS-realtime protobuf feeds.

Every call is a form POST with a token from `authenticateUser`, which needs
the account's username and password; tokens last about a day, and each API
issues its own. The browser can't hold the password and the API isn't meant
to be called cross-origin, so a backend is needed (toolbox-wide
[ADR 0004](../../../../docs/adr/0004-per-tool-backend-and-firestore-naming.md):
`toolbox-njtransit-bus-api`, `us-central1`).

Checked against the live API on 2026-10-24:

- `getBusDV` works with a plain stop number (GTFS `stop_code`), not just
  terminal codes; `stop=26229` and `stop=PABT` return the same Port
  Authority board. Its `internal_trip_number` equals the GTFS `trip_id`.
- A bus is being tracked only when `departurestatus` is "in N mins" or "All
  Aboard"; otherwise it's the scheduled clock time (even with a vehicle
  assigned). When tracked, the "in N mins" countdown is the estimate to use
  (amended 2026-10-24): `departuretime` is a whole-minute clock that lags it
  (it read 02:05 PM while the countdown said 2:07), and the countdown is what
  NJ Transit's own app shows.
- GTFS `stops.txt` has one row per Port Authority gate (`platform_code`
  like `200_1`), all with stop_code 26229, so the timetable alone knows each
  trip's scheduled gate. `lanegate` from BUSDV2 uses the same format.
- A bad token comes back as `{"message":{"message":"invalid token"}}`.

## Decision

- **Backend** (plain Node, one dependency, `fflate`, to unzip): downloads
  and parses the GTFS zip at startup (~6 s on Cloud Run, ~600 MB RSS, so
  1 GiB memory) into typed arrays: trips' stop sequences, each stop's
  positions, routes and headsigns per stop, service calendars. It reloads
  the timetable after 20 h, inside the request that notices (Cloud Run
  throttles CPU outside requests, so nothing runs in the background).
- **Which buses**: a trip counts if it stops at the "from" stop or a
  nearby one, and later at the "to" stop or a nearby one. "Nearby" is
  within 200 m **and** served by a route that also serves the chosen stop
  (amended 2026-10-24: distance alone matched Port Imperial Blvd, 178 m
  from Boulevard East at 50th St but at the bottom of the Palisades, so the
  158 showed up for a Boulevard East trip). The radius is what makes the
  flip button work: the way back usually leaves from the stop across the
  street, a different stop number on the same routes. When a bus leaves
  from a nearby stop rather than the one picked, the board says "FROM
  <that stop>".
- **Live**: for the next ~75 min's buses, `getBusDV` at the stops they leave
  from (at most 3, cached 15 s), matched by trip id. Tracked → NJ Transit's
  countdown (fetch time + N min), shown as minutes rounded to the nearest
  minute plus the clock time it lands on; not tracked → the timetable time, shown as a
  clock time and marked SCHEDULED/SCHED. Tracked buses win (amended
  2026-10-24, `api/order.js`): timetable buses only show after the last
  tracked one, since one listed before it is most likely that bus running late
  or one that isn't coming. Buses scheduled up to 45 min ago
  stay if NJ Transit still has them coming. If BUSDV2 fails, the board still
  shows the timetable (`liveOk: false` changes the SCHEDULED note).
- **Gate**: BUSDV2's `lanegate` when present, else the timetable's
  platform_code; shown as NJ Transit writes it ("200-1").
- **GTFS-realtime feeds aren't used**: `getBusDV` already gives tracked
  times per stop, as JSON, without a protobuf decoder.
- **Frontend**: Vite + React, no router, no sign-in. Stops and direction in
  `localStorage`. Polls `/departures` every 20 s while visible; countdowns
  tick locally from the bus's epoch time.

## Consequences

- One cold start costs ~6 s plus the zip download from NJ Transit; the
  instance then serves stop search and departures from memory in
  milliseconds. Each cold start downloads ~50 MB from NJ Transit.
- The 200 m radius can pull in a stop a short walk away on the same line;
  the "FROM" line makes that visible instead of hiding it. A route that only
  stops nearby (no stop shared with the chosen one) is never shown.
- Only bus data is searched for stops, but light rail is in the same
  timetable and would mostly work; untested.
- The NJ Transit login lives in Secret Manager; rotating the password means
  adding a new secret version (`gcloud secrets versions add njtransit-bus-password --data-file=-`)
  and redeploying the service.
