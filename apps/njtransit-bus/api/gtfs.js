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

import { inflateRawSync } from 'node:zlib';
import { addDays, nyDate, serviceDayStart, weekday } from './time.js';

export const WALK_METERS = 200;

const FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'];

// The named files of a zip, as text. Node's own inflate is native, several
// times faster than a JavaScript one on the 85 MB stop_times.txt; the zip
// itself is read from its central directory (sizes there are always right,
// unlike the local headers of a streamed zip).
export function unzipText(bytes, names) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out = {};
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const skip = nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + skip;
    if (!names.includes(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw new Error(`${name}: unsupported zip method ${method}`);
    out[name] = decoder.decode(method === 0 ? raw : inflateRawSync(raw));
  }
  return out;
}

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

// stop_times.txt is most of the load time (~1.8 M rows), so it gets its own
// loop: only the four columns used are cut out of each line, with no array
// per row. A line with quotes (none in NJ Transit's) goes the slow, exact way.
// Calls onRow(tripId, stopId, stopSequence, departure or arrival time).
function eachStopTime(text, onRow) {
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let headerEnd = text.indexOf('\n', start);
  if (headerEnd === -1) headerEnd = text.length;
  const header = splitCsvLine(text.slice(start, headerEnd).replace(/\r$/, '')).map((h) => h.trim());
  const cTrip = header.indexOf('trip_id');
  const cStop = header.indexOf('stop_id');
  const cSeq = header.indexOf('stop_sequence');
  const cDep = header.indexOf('departure_time');
  const cArr = header.indexOf('arrival_time');
  const want = Math.max(cTrip, cStop, cSeq, cDep, cArr) + 1;
  const cut = new Array(want);
  start = headerEnd + 1;
  let quote = 0; // where the next quote is (-1: none left); searched again only once passed
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    let lineEnd = end;
    if (text.charCodeAt(lineEnd - 1) === 13) lineEnd--;
    if (lineEnd > start) {
      if (quote !== -1 && quote < start) quote = text.indexOf('"', start);
      if (quote !== -1 && quote < lineEnd) {
        const f = splitCsvLine(text.slice(start, lineEnd));
        for (let k = 0; k < want; k++) cut[k] = f[k] ?? '';
      } else {
        let from = start;
        for (let k = 0; k < want; k++) {
          let comma = text.indexOf(',', from);
          if (comma === -1 || comma > lineEnd) comma = lineEnd;
          cut[k] = k === cTrip || k === cStop || k === cSeq || k === cDep || k === cArr ? text.slice(from, comma) : '';
          from = comma < lineEnd ? comma + 1 : lineEnd;
        }
      }
      onRow(cut[cTrip], cut[cStop], +cut[cSeq], (cDep >= 0 && cut[cDep]) || (cArr >= 0 && cut[cArr]) || '');
    }
    start = end + 1;
  }
}

// "25:07:30" → seconds after the service day's start (hours can pass 24).
function secs(hms) {
  let total = 0;
  let part = 0;
  let colons = 0;
  for (let i = 0; i < hms.length; i++) {
    const c = hms.charCodeAt(i);
    if (c === 58) {
      total = (total + part) * 60;
      part = 0;
      colons++;
    } else if (c >= 48 && c <= 57) part = part * 10 + c - 48;
  }
  total += part;
  return colons === 1 ? total * 60 : total; // "7:24" with no seconds
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
  return splitHeadsign(headsign, route).headsign;
}

// The route as riders know it: a lettered variant leading the headsign ("159X
// NEW YORK 60TH STREET EXPRESS") is its own bus, though GTFS files it under 159.
export function splitHeadsign(headsign, route) {
  const h = (headsign || '').trim().replace(/\s+/g, ' ');
  const lead = h.split(' ')[0];
  if (route && (lead === route || lead.replace(/[A-Z]+$/, '') === route)) {
    return { route: lead, headsign: h.slice(lead.length).trim() || h };
  }
  return { route, headsign: h };
}

export function loadGtfs(zipBytes) {
  const files = unzipText(zipBytes, FILES);
  const text = (name) => files[name] || '';

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

  // `route` is what's shown (159X); `line` is GTFS's route (159), for telling
  // which stops nearby share a route.
  const trips = []; // { id, route, line, headsign, service }
  const tripIndex = new Map();
  eachRow(text('trips.txt'), (f, c) => {
    tripIndex.set(f[c.trip_id], trips.length);
    const line = routeName.get(f[c.route_id]) || f[c.route_id];
    const { route, headsign } = splitHeadsign(f[c.trip_headsign], line);
    trips.push({ id: f[c.trip_id], route, line, headsign, service: f[c.service_id] });
  });

  // stop_times, as parallel typed arrays sorted by (trip, sequence).
  let n = 0;
  let cap = 1 << 21;
  let tTrip = new Int32Array(cap);
  let tSeq = new Int32Array(cap);
  let tStop = new Int32Array(cap);
  let tDep = new Int32Array(cap);
  const gates = new Map(); // row index → gate, Port Authority-style stops only
  eachStopTime(text('stop_times.txt'), (tripId, stopId, seq, time) => {
    const trip = tripIndex.get(tripId);
    const row = rowStop.get(stopId);
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
    tSeq[n] = seq;
    tStop[n] = row.stop.i;
    tDep[n] = secs(time);
    if (row.gate) gates.set(n, row.gate);
    n++;
  });

  // Sorted by (trip, sequence): grouped by trip with a counting sort, which keeps
  // the file's order within a trip, already by sequence in NJ Transit's file
  // (a trip that isn't gets sorted on its own). A comparator sort of all 1.8 M
  // rows took ~0.5 s.
  const tripStart = new Int32Array(trips.length + 1);
  for (let i = 0; i < n; i++) tripStart[tTrip[i] + 1]++;
  for (let t = 0; t < trips.length; t++) tripStart[t + 1] += tripStart[t];
  const order = new Int32Array(n);
  const next = tripStart.slice(0, trips.length);
  for (let i = 0; i < n; i++) order[next[tTrip[i]]++] = i;
  for (let t = 0; t < trips.length; t++) {
    for (let k = tripStart[t] + 1; k < tripStart[t + 1]; k++) {
      if (tSeq[order[k]] < tSeq[order[k - 1]]) {
        order.subarray(tripStart[t], tripStart[t + 1]).sort((a, b) => tSeq[a] - tSeq[b]);
        break;
      }
    }
  }
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
    stops[sStop[i]].served.add(trips[sTrip[i]].line);
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
            line: trip.line,
            // When the trip leaves its first stop, in minutes after midnight
            // (how service alerts name a trip: "the 7:36 AM departure").
            startMinute: Math.floor(sDep[tripStart[t]] / 60) % 1440,
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
