// The GTFS timetable (getGTFS's zip), loaded into compact in-memory indexes.
//
// What it answers:
// - stop search (by name or number, or nearest to a point), with the routes
//   and headsigns each stop sees so two same-named stops across the street
//   from each other can be told apart;
// - which trips go from one place to another (the "from" and "to" are each
//   the chosen stop plus stops within WALK_METERS of it on a route it shares,
//   so flipping a trip still works when the way back leaves from the other
//   side of the street);
// - their scheduled departures over the next day, with the Port Authority gate
//   when the timetable has one.
//
// Trip ids here are the same numbers BUSDV2 calls internal_trip_number, which
// is how live departures get matched to these trips.

import { unzipSync, strFromU8 } from 'fflate';
import { addDays, nyDate, serviceDayStart, weekday } from './time.js';

export const WALK_METERS = 200;

const FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'];

function splitCsvLine(line) {
  if (!line.includes('"')) return line.split(',');
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// Calls onRow(fields, col) for each data row; col maps header name → index.
function eachRow(text, onRow) {
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let col = null;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    let line = text.slice(start, end);
    start = end + 1;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (!line) continue;
    const fields = splitCsvLine(line);
    if (!col) {
      col = Object.fromEntries(fields.map((name, i) => [name.trim(), i]));
      continue;
    }
    onRow(fields, col);
  }
}

function secs(hms) {
  const [h, m, s] = hms.split(':');
  return +h * 3600 + +m * 60 + +(s || 0);
}

export function meters(aLat, aLon, bLat, bLon) {
  const rad = Math.PI / 180;
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

const normalize = (s) =>
  ` ${s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ')} `
    .replace(/ AVENUE /g, ' AVE ')
    .replace(/ AV /g, ' AVE ')
    .replace(/ STREET /g, ' ST ')
    .replace(/ BOULEVARD /g, ' BLVD ')
    .replace(/ ROAD /g, ' RD ')
    .replace(/ AND /g, ' ')
    .replace(/ AT /g, ' ')
    .replace(/ +/g, ' ');

// "156 ENGLEWOOD CLIFFS VIA PARK AVE" → "ENGLEWOOD CLIFFS VIA PARK AVE"
export function cleanHeadsign(headsign, route) {
  const h = (headsign || '').trim().replace(/\s+/g, ' ');
  const lead = h.split(' ')[0];
  if (route && (lead === route || lead.replace(/[A-Z]+$/, '') === route)) return h.slice(lead.length).trim() || h;
  return h;
}

export function loadGtfs(zipBytes) {
  const files = unzipSync(zipBytes, { filter: (f) => FILES.includes(f.name) });
  const text = (name) => (files[name] ? strFromU8(files[name]) : '');

  // Stops, one entry per public stop number. A stop number can have several
  // rows (Port Authority has one per gate); stopRow keeps each row's gate.
  const stops = []; // { code, name, lat, lon, norm, routes, heads }
  const stopByCode = new Map();
  const rowStop = new Map(); // stop_id → { stop, gate }
  eachRow(text('stops.txt'), (f, c) => {
    if (f[c.location_type] === '1') return;
    const code = (f[c.stop_code] || f[c.stop_id]).trim();
    let stop = stopByCode.get(code);
    if (!stop) {
      stop = {
        i: stops.length,
        code,
        name: f[c.stop_name].trim().replace(/\s+/g, ' '),
        lat: +f[c.stop_lat],
        lon: +f[c.stop_lon],
        routes: new Map(),
        served: new Set(), // every route stopping here, last stops included
        heads: new Map(),
      };
      stop.norm = normalize(stop.name);
      stops.push(stop);
      stopByCode.set(code, stop);
    }
    const platform = c.platform_code !== undefined ? (f[c.platform_code] || '').trim() : '';
    rowStop.set(f[c.stop_id], { stop, gate: platform && platform !== '..' ? platform : null });
  });

  const routeName = new Map();
  eachRow(text('routes.txt'), (f, c) => {
    routeName.set(f[c.route_id], (f[c.route_short_name] || f[c.route_long_name] || f[c.route_id]).trim());
  });

  const trips = []; // { id, route, headsign, service }
  const tripIndex = new Map();
  eachRow(text('trips.txt'), (f, c) => {
    tripIndex.set(f[c.trip_id], trips.length);
    const route = routeName.get(f[c.route_id]) || f[c.route_id];
    trips.push({ id: f[c.trip_id], route, headsign: cleanHeadsign(f[c.trip_headsign], route), service: f[c.service_id] });
  });

  // stop_times, as parallel typed arrays sorted by (trip, sequence).
  let n = 0;
  let cap = 1 << 21;
  let tTrip = new Int32Array(cap);
  let tSeq = new Int32Array(cap);
  let tStop = new Int32Array(cap);
  let tDep = new Int32Array(cap);
  const gates = new Map(); // row index → gate, Port Authority-style stops only
  eachRow(text('stop_times.txt'), (f, c) => {
    const trip = tripIndex.get(f[c.trip_id]);
    const row = rowStop.get(f[c.stop_id]);
    if (trip === undefined || !row) return;
    if (n === cap) {
      cap *= 2;
      const grow = (a) => {
        const b = new Int32Array(cap);
        b.set(a);
        return b;
      };
      tTrip = grow(tTrip);
      tSeq = grow(tSeq);
      tStop = grow(tStop);
      tDep = grow(tDep);
    }
    tTrip[n] = trip;
    tSeq[n] = +f[c.stop_sequence];
    tStop[n] = row.stop.i;
    tDep[n] = secs(f[c.departure_time] || f[c.arrival_time]);
    if (row.gate) gates.set(n, row.gate);
    n++;
  });

  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => tTrip[a] - tTrip[b] || tSeq[a] - tSeq[b]);
  const sTrip = new Int32Array(n);
  const sStop = new Int32Array(n);
  const sDep = new Int32Array(n);
  const sGate = new Map();
  for (let i = 0; i < n; i++) {
    const o = order[i];
    sTrip[i] = tTrip[o];
    sStop[i] = tStop[o];
    sDep[i] = tDep[o];
    const g = gates.get(o);
    if (g) sGate.set(i, g);
  }
  const tripStart = new Int32Array(trips.length + 1).fill(-1);
  for (let i = n - 1; i >= 0; i--) tripStart[sTrip[i]] = i;
  tripStart[trips.length] = n;
  for (let t = trips.length - 1; t >= 0; t--) if (tripStart[t] === -1) tripStart[t] = tripStart[t + 1];

  // Where each stop appears, plus the routes and headsigns it sees (not counting
  // the last stop of a trip, where nobody boards).
  const counts = new Int32Array(stops.length);
  for (let i = 0; i < n; i++) counts[sStop[i]]++;
  const stopPosStart = new Int32Array(stops.length + 1);
  for (let s = 0; s < stops.length; s++) stopPosStart[s + 1] = stopPosStart[s] + counts[s];
  const stopPos = new Int32Array(n);
  const fill = stopPosStart.slice(0, stops.length);
  for (let i = 0; i < n; i++) {
    stopPos[fill[sStop[i]]++] = i;
    stops[sStop[i]].served.add(trips[sTrip[i]].route);
    const last = i + 1 === n || sTrip[i + 1] !== sTrip[i];
    if (last) continue;
    const trip = trips[sTrip[i]];
    const stop = stops[sStop[i]];
    stop.routes.set(trip.route, (stop.routes.get(trip.route) || 0) + 1);
    stop.heads.set(trip.headsign, (stop.heads.get(trip.headsign) || 0) + 1);
  }

  const calendar = new Map();
  eachRow(text('calendar.txt'), (f, c) => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => f[c[d]] === '1');
    calendar.set(f[c.service_id], { days, start: f[c.start_date], end: f[c.end_date] });
  });
  const exceptions = new Map(); // date → Map(service → added?)
  eachRow(text('calendar_dates.txt'), (f, c) => {
    const date = f[c.date];
    if (!exceptions.has(date)) exceptions.set(date, new Map());
    exceptions.get(date).set(f[c.service_id], f[c.exception_type] === '1');
  });
  const activeCache = new Map();
  function activeServices(date) {
    if (activeCache.has(date)) return activeCache.get(date);
    const on = new Set();
    const wd = weekday(date);
    for (const [service, cal] of calendar) if (cal.days[wd] && cal.start <= date && date <= cal.end) on.add(service);
    for (const [service, added] of exceptions.get(date) || []) {
      if (added) on.add(service);
      else on.delete(service);
    }
    activeCache.set(date, on);
    return on;
  }

  function stopSummary(stop, extra = {}) {
    const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([v]) => v);
    const routes = top(stop.routes, 99).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return { code: stop.code, name: stop.name, lat: stop.lat, lon: stop.lon, routes, headsigns: top(stop.heads, 3), ...extra };
  }

  // The stop itself, plus stops within the radius that share a route with it:
  // the other side of the street, or the next stop on the same line. Distance
  // alone isn't enough: a stop 180 m away can be at the bottom of a cliff (Port
  // Imperial under Boulevard East) on routes that never come near this one.
  function nearbyStops(stop, radius = WALK_METERS) {
    const out = [];
    for (const s of stops) {
      const d = meters(stop.lat, stop.lon, s.lat, s.lon);
      if (d > radius) continue;
      if (s !== stop && ![...s.served].some((r) => stop.served.has(r))) continue;
      out.push({ stop: s, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  return {
    stopCount: stops.length,
    tripCount: trips.length,
    stopTimeCount: n,

    // A stop_id (one row of stops.txt, e.g. one Port Authority gate) → its stop number.
    stopCode: (stopId) => rowStop.get(stopId)?.stop.code ?? null,

    getStop: (code) => {
      const s = stopByCode.get(String(code));
      return s ? stopSummary(s) : null;
    },

    // Stops matching every word of q (or its stop number), busiest first.
    searchStops(q, limit = 15) {
      const query = normalize(q).trim();
      if (!query) return [];
      const words = query.split(' ');
      const busy = (s) => [...s.routes.values()].reduce((a, b) => a + b, 0);
      const hits = [];
      for (const s of stops) {
        if (s.routes.size === 0) continue;
        if (s.code === query) hits.push({ s, rank: 0 });
        else if (words.every((w) => s.norm.includes(` ${w}`))) hits.push({ s, rank: s.norm.startsWith(` ${words[0]}`) ? 1 : 2 });
      }
      hits.sort((a, b) => a.rank - b.rank || busy(b.s) - busy(a.s));
      return hits.slice(0, limit).map(({ s }) => stopSummary(s));
    },

    nearestStops(lat, lon, limit = 12) {
      return stops
        .filter((s) => s.routes.size > 0)
        .map((s) => ({ s, d: meters(lat, lon, s.lat, s.lon) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, limit)
        .map(({ s, d }) => stopSummary(s, { meters: Math.round(d) }));
    },

    // Scheduled departures from near `fromCode` that later stop near `toCode`,
    // leaving between `sinceMs` and `untilMs`, soonest first.
    departures(fromCode, toCode, sinceMs, untilMs) {
      const from = stopByCode.get(String(fromCode));
      const to = stopByCode.get(String(toCode));
      if (!from || !to) return null;
      const fromNear = nearbyStops(from);
      const toSet = new Set(nearbyStops(to).map(({ stop }) => stop.i));
      const fromRank = new Map(fromNear.map(({ stop }, rank) => [stop.i, rank]));

      // For each trip, the boarding position: the nearby stop closest to the one
      // picked (ties: the earlier one) that still has a "to" stop after it.
      const board = new Map(); // trip → position
      for (const { stop } of fromNear) {
        if (toSet.has(stop.i)) continue;
        for (let k = stopPosStart[stop.i]; k < stopPosStart[stop.i + 1]; k++) {
          const p = stopPos[k];
          const t = sTrip[p];
          const prev = board.get(t);
          if (prev !== undefined && fromRank.get(sStop[prev]) <= fromRank.get(stop.i)) continue;
          let reaches = false;
          for (let q = p + 1; q < tripStart[t + 1]; q++) {
            if (toSet.has(sStop[q])) {
              reaches = true;
              break;
            }
          }
          if (reaches) board.set(t, p);
        }
      }

      const out = [];
      const today = nyDate(sinceMs);
      for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
        const on = activeServices(date);
        const base = serviceDayStart(date);
        for (const [t, p] of board) {
          const trip = trips[t];
          if (!on.has(trip.service)) continue;
          const at = base + sDep[p] * 1000;
          if (at < sinceMs || at > untilMs) continue;
          const stop = stops[sStop[p]];
          out.push({
            trip: trip.id,
            route: trip.route,
            headsign: trip.headsign,
            scheduled: at,
            gate: sGate.get(p) || null,
            stop: { code: stop.code, name: stop.name },
          });
        }
      }
      out.sort((a, b) => a.scheduled - b.scheduled);
      return { from: stopSummary(from), to: stopSummary(to), departures: out };
    },
  };
}
