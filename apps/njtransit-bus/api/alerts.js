// Which NJ Transit service alerts (getAlerts, parsed by realtime.js) belong on
// a board. The feed covers the whole system; an alert names routes (and
// sometimes stops), never trips. Nearly all of them are one cancelled trip,
// said only in words: "Bus route 165, the 7:36 AM departure from Westwood to
// NY PABT, will not operate due to operator availability." So:
//
// - when its words give a departure time, it counts if a trip on that route
//   starting at that time still has to pass the boarding stop, shown or not (the
//   6:41 AM 166 that "did not operate" is old news by 8 AM, and a 165 from
//   another branch that never comes here isn't this board's business);
// - any other alert naming a route of a bus shown counts;
// - an alert naming a boarding stop counts;
// - the terminals' screen messages ("Have a nice day", ids like HACK, tied to
//   a terminal's gates) never count.

// "the 7:36 AM departure" → minutes after midnight (456), else null.
export function departureMinute(text) {
  const m = /\b(\d{1,2}):(\d{2})\s*([AP])\.?\s*M\b\.?[^.]*?\bdepartur/i.exec(text || '');
  if (!m) return null;
  const h = (+m[1] % 12) + (m[3].toUpperCase() === 'P' ? 12 : 0);
  return h * 60 + +m[2];
}

const terminalMessage = (a) => a.routes.size === 0 && /^[A-Z]{4}$/.test(a.id || '');

/**
 * alerts: parseAlerts output. board: { now, lines (Set of GTFS routes of the
 * buses shown), stops (Set of boarding stop numbers), trips ([{ trip, line,
 * startMinute, scheduled }], every next run from here to there, cancelled ones
 * included) }. → [{ id, routes, text, trips }] for the board, soonest first.
 */
export function boardAlerts(alerts, { now, lines, stops, trips }) {
  const out = [];
  for (const a of alerts) {
    if (terminalMessage(a)) continue;
    if ((a.start && a.start > now) || (a.end && a.end <= now)) continue;
    const text = a.text || a.header;
    if (!text) continue;
    const atStop = [...a.stops].some((s) => stops.has(s));
    // A named departure counts when that trip still has to pass here, whether
    // or not a bus of its route is among those shown (twelve 128s can push the
    // only 165 off the list). Anything else counts by the routes shown.
    const minute = a.routes.size ? departureMinute(text) : null;
    let hit = [];
    let routes;
    if (minute !== null) {
      hit = trips.filter(
        (t) => a.routes.has(t.line) && t.startMinute === minute && t.scheduled >= now - 60 * 1000 && (!a.end || t.scheduled < a.end),
      );
      if (!hit.length && !atStop) continue;
      routes = [...new Set(hit.map((t) => t.line))];
    } else {
      routes = [...a.routes].filter((r) => lines.has(r));
      if (!routes.length && !atStop) continue;
    }
    out.push({
      id: a.id,
      routes: routes.length ? routes : [...a.routes],
      text,
      trips: hit.map((t) => t.trip),
      at: hit.length ? Math.min(...hit.map((t) => t.scheduled)) : null,
    });
  }
  return out.sort((x, y) => (x.at ?? Infinity) - (y.at ?? Infinity));
}
