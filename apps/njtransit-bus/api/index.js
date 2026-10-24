// toolbox-njtransit-bus-api — the only place the NJ Transit developer login lives.
//
// No sign-in: anyone can look up buses, the same as on njtransit.com. The
// browser never talks to NJ Transit directly (it needs the login, and its API
// doesn't allow cross-origin calls); it asks this service, which keeps the
// timetable in memory and asks NJ Transit for live departures.
// See apps/njtransit-bus/docs/adr/0001-njtransit-bus-architecture.md.

import http from 'node:http';
import { loadGtfs } from './gtfs.js';
import { downloadGtfs, liveDepartures, realtimeFeeds } from './njt.js';
import { liveFirst } from './order.js';

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS || 'https://toolbox.vuongho.me,http://localhost:5173'
).split(',');
const GTFS_MAX_AGE_MS = 20 * 3600 * 1000;
const LIVE_CACHE_MS = 15 * 1000;
// Buses scheduled this long ago can still be coming if they're running late.
const LATE_WINDOW_MS = 45 * 60 * 1000;
// BUSDV2 only knows about roughly the next hour.
const LIVE_WINDOW_MS = 75 * 60 * 1000;
const MAX_LIVE_STOPS = 3;
const MAX_BUSES = 12;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- timetable

let gtfs = null; // { data, at }
let gtfsLoading = null;

function refreshGtfs() {
  if (!gtfsLoading) {
    gtfsLoading = (async () => {
      const started = Date.now();
      const data = loadGtfs(await downloadGtfs());
      gtfs = { data, at: Date.now() };
      console.log(`GTFS loaded in ${Date.now() - started} ms: ${data.stopCount} stops, ${data.tripCount} trips`);
    })().finally(() => {
      gtfsLoading = null;
    });
  }
  return gtfsLoading;
}

// Cloud Run only gives an instance CPU while it handles a request (or starts
// up), so a stale timetable is reloaded inside the request that notices it,
// not in the background. Instances rarely live long enough for that to happen.
async function timetable() {
  if (!gtfs) {
    await refreshGtfs();
  } else if (Date.now() - gtfs.at > GTFS_MAX_AGE_MS) {
    await refreshGtfs().catch((err) => console.error('GTFS refresh failed, keeping the old one:', err));
  }
  return gtfs.data;
}

// ---------------------------------------------------------------- live

const liveCache = new Map(); // stop code → { at, value: Promise<Map> }

function liveAt(stopCode) {
  const hit = liveCache.get(stopCode);
  if (hit && Date.now() - hit.at < LIVE_CACHE_MS) return hit.value;
  const value = liveDepartures(stopCode);
  liveCache.set(stopCode, { at: Date.now(), value });
  value.catch(() => liveCache.delete(stopCode));
  return value;
}

// One copy of the GTFS-realtime feeds for every request; they cover the whole system.
let rt = null; // { at, value: Promise<{ updates, moving }> }

function realtime() {
  if (rt && Date.now() - rt.at < LIVE_CACHE_MS) return rt.value;
  const value = realtimeFeeds();
  rt = { at: Date.now(), value };
  value.catch(() => {
    if (rt?.value === value) rt = null;
  });
  return value;
}

// The trip's predicted time at a stop number: undefined if the feed has none,
// null if the trip is cancelled.
function predicted(updates, data, trip, stopCode) {
  const stops = updates.get(trip);
  if (stops === null) return null;
  if (!stops) return undefined;
  for (const [stopId, at] of stops) if (data.stopCode(stopId) === stopCode) return at;
  return undefined;
}

async function departures(fromCode, toCode) {
  const data = await timetable();
  const now = Date.now();
  const sched = data.departures(fromCode, toCode, now - LATE_WINDOW_MS, now + 24 * 3600 * 1000);
  if (!sched) throw new HttpError(404, 'Unknown stop');

  // Ask for live times at the stops the next hour's buses leave from.
  const soon = sched.departures.filter((d) => d.scheduled <= now + LIVE_WINDOW_MS);
  const stopCounts = new Map();
  for (const d of soon) stopCounts.set(d.stop.code, (stopCounts.get(d.stop.code) || 0) + 1);
  const liveStops = [...stopCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_LIVE_STOPS).map(([code]) => code);
  const live = new Map();
  let liveOk = true;
  let updates = new Map();
  let moving = new Set();
  await Promise.all([
    realtime()
      .then((r) => ({ updates, moving } = r))
      .catch((err) => console.error('GTFS-realtime failed:', err.message)),
    ...liveStops.map(async (code) => {
      try {
        for (const [trip, v] of await liveAt(code)) live.set(`${code}:${trip}`, v);
      } catch (err) {
        liveOk = false;
        console.error(`live departures at ${code} failed:`, err.message);
      }
    }),
  ]);

  const buses = [];
  for (const d of sched.departures) {
    const v = live.get(`${d.stop.code}:${d.trip}`);
    const p = predicted(updates, data, d.trip, d.stop.code);
    if (p === null && !v?.live) continue; // cancelled
    // BUSDV2's "in 7 mins" is whole minutes counted from when it was asked, so
    // a tracked bus takes the trip-updates time when the two agree (they come
    // from the same prediction; it keeps the clock time from drifting a minute).
    // BUSDV2 also leaves out buses that are on the road, late ones included: one
    // a bus is reporting its GPS position on counts as tracked, at its
    // trip-updates time. Without a bus on it, a trip stays on the timetable.
    let at = v?.at ?? d.scheduled;
    let tracked = Boolean(v?.live);
    if (tracked) {
      if (p && Math.abs(p - v.at) < 2 * 60 * 1000) at = p;
    } else if (p && moving.has(d.trip)) {
      at = p;
      tracked = true;
    }
    // Gone, unless NJ Transit still has it coming.
    if (at < now - 60 * 1000 || (!v && !tracked && d.scheduled < now)) continue;
    buses.push({
      trip: d.trip,
      route: d.route,
      headsign: d.headsign,
      at,
      scheduled: d.scheduled,
      live: tracked,
      gate: v?.gate || d.gate,
      load: v?.live ? v.load : null,
      stop: d.stop,
    });
  }
  return { from: sched.from, to: sched.to, now, liveOk, buses: liveFirst(buses).slice(0, MAX_BUSES) };
}

// ---------------------------------------------------------------- http

function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    const headers = { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
    if (origin && ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    res.writeHead(204, headers);
    return res.end();
  }
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method !== 'GET') throw new HttpError(405, 'GET only');
    if (url.pathname === '/health') return send(res, 200, { ok: true, gtfsAt: gtfs?.at ?? null }, origin);

    if (url.pathname === '/stops') {
      const data = await timetable();
      const q = url.searchParams.get('q');
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      if (q) return send(res, 200, { stops: data.searchStops(q.slice(0, 80)) }, origin);
      if (Number.isFinite(lat) && Number.isFinite(lon) && url.searchParams.has('lat')) {
        return send(res, 200, { stops: data.nearestStops(lat, lon) }, origin);
      }
      throw new HttpError(400, 'Give q, or lat and lon');
    }

    if (url.pathname === '/departures') {
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to) throw new HttpError(400, 'Give from and to');
      return send(res, 200, await departures(from, to), origin);
    }

    throw new HttpError(404, 'Not found');
  } catch (err) {
    const status = err.status || 502;
    if (status >= 500) console.error(err);
    send(res, status, { error: status >= 500 ? 'NJ Transit is not answering right now' : err.message }, origin);
  }
});

// Load the timetable before taking requests, while Cloud Run still gives
// startup full CPU. If NJ Transit is down, start anyway; requests retry it.
refreshGtfs()
  .catch((err) => console.error('GTFS load failed:', err))
  .finally(() => server.listen(PORT, () => console.log(`listening on ${PORT}`)));
