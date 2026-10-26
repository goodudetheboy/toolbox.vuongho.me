# 0004. GTFS-realtime fills in the tracked buses BUSDV2 leaves out

Date: 2026-10-24. Supersedes the "GTFS-realtime feeds aren't used" point of
[ADR 0001](0001-njtransit-bus-architecture.md).

## Context

The user compared the board with NJ Transit's own app at Boulevard East at
62nd St → Port Authority (Saturday, 6:33 PM). Both showed the same two tracked
buses, but NJ Transit's app (which shows BUSDV2) listed only 3 buses for the
hour; the board added 4 more from the timetable. Checking:

- BUSDV2 (`getBusDV`) leaves out trips that are running. At one point it
  skipped three buses (a 165 and a 166 running 15–22 min late, and the 165 it
  had shown "in 13 mins" a minute earlier) whose GPS put them a few hundred
  meters up Boulevard East, coming toward the stop. It does the same at Port
  Authority.
- GTFSG2's GTFS-realtime feeds, with the same login, have them: **trip
  updates** (`getTripUpdates`, ~2 MB protobuf, predicted time at every stop of
  every running/soon trip, system-wide) and **vehicle positions**
  (`getVehiclePositions`, ~50 KB, which trip each bus is driving, with a
  timestamp). For trips BUSDV2 does track, the trip-updates time matched its
  estimate to the second.
- Trip updates also predict trips with no bus on them yet (pushed back from a
  late earlier run). The user only wants GPS-tracked buses added, not those
  estimates.

## Decision

- `api/realtime.js` decodes just the needed protobuf fields by hand (no
  library); `njt.js` `realtimeFeeds()` fetches both feeds, cached 15 s for
  every request (`index.js` `realtime()`).
- A trip BUSDV2 doesn't track counts as **tracked** when a bus reported its
  position on that trip in the last 3 minutes and trip updates have a time for
  it at the boarding stop; that time is used. No bus on it → it stays a
  timetable (SCHED) bus, even if trip updates have an estimate.
- A bus BUSDV2 does track takes the trip-updates time when it's within 2 min
  of BUSDV2's (BUSDV2's "in N mins" is whole minutes counted from the fetch,
  so its clock time drifted a minute between polls; NJ Transit's app showed
  6:41 while the board showed 6:42).
- A trip trip-updates marks cancelled is dropped unless BUSDV2 tracks it.
- If the realtime feeds fail, the board works as before on BUSDV2 alone.
- No change to how the web or watch apps show buses: they only see more with
  `live: true`. For debugging, `/departures?…&debug=1` also returns `debug` per bus
  (`source`: busdv / gps / timetable, BUSDV2's raw status and vehicle, the
  trip-updates time, the GPS vehicle with its distance to the boarding stop and
  age) and for the whole answer (feed health). The web board shows it in a stats
  sheet behind a nerd-face button at the end of the list, and only asks for
  `debug` while the sheet is open; the watch never asks.

## Consequences

- ~2 MB downloaded and parsed per 15 s while anyone is looking, instead of
  only per-stop BUSDV2 calls.
- Buses added this way have no BUSDV2 gate; gates fall back to the
  timetable's. (Addendum 2026-10-26: they do have a load after all: vehicle
  positions carry `occupancy_status` for nearly every bus, FEW_SEATS_AVAILABLE
  and FULL matching BUSDV2's HALF_EMPTY and FULL; see `realtime.js`.)
- The board can list more tracked buses than NJ Transit's own app does; that's
  the point, and the extra ones are backed by GPS.
