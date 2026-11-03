# 0005. Service alerts: matched to the board in the API, shown as a red banner

Date: 2026-11-03

## Context

The user asked for NJ Transit's service alerts about the buses on their board.
GTFSG2's `getAlerts` (same login, ~5 KB protobuf, whole system) was checked on a
weekday morning:

- Almost every alert is one cancelled trip, said only in words: "Bus route 165,
  the 7:36 AM departure from Westwood to NY PABT, will not operate due to
  operator availability." It names the route (`route_id`, which is the route
  number, e.g. 165 for 159X's GTFS route 159 too), never the trip or a stop,
  and no cause/effect. Many are repeated 2–5 times. Past ones stay all day
  ("did not operate").
- Some are route-wide (a detour on routes 1 and 25, tagged with route 1 only).
- Four are the terminals' screen messages ("Have a nice day", "Te s"), ids like
  HACK and ATLC, tied to the terminal's gates.

## Decision

- `realtime.js` `parseAlerts` decodes them; `njt.js` `serviceAlerts()` fetches
  them, cached 60 s for every request (`index.js`).
- `alerts.js` `boardAlerts` picks the ones for a board, in the API (the watch
  or anything else can reuse the answer): an alert counts when it names a
  route of a bus shown, or a boarding stop. When its words give a departure
  time ("the 7:36 AM departure"), it counts only if a trip on that route
  starting at that time still has to pass the boarding stop; the alert carries
  those trip ids and when it was due. Terminal screen messages never count.
- `/departures` returns `alerts: [{ id, routes, text, trips, at }]`. If the
  alerts feed fails, the board is unchanged (`debug.alertsError` says so).
- The web board shows a red strip across the top with the alerts running
  through it (static, cut off, with reduced motion); tapping it opens a red
  sheet with each alert in full. Red is used only here; the board stays two
  colors otherwise.

## Consequences

- Matching a cancellation to a trip depends on NJ Transit's wording. If it
  changes, timed alerts stop matching and fall back to nothing (an untimed
  route alert still shows). Tests in `alerts.test.js` pin the wording seen.
- Bus tiles don't change: a trip an alert cancels but trip updates don't can
  still be listed as a SCHED bus (even as NEXT BUS). The user chose to leave
  it (2026-11-03): the banner is the warning; tiles never change from parsed
  alert text.
- The watch app ignores `alerts` for now.
