// NJ Transit's developer API (pcsdata.njtransit.com). Every call is a POST of
// form fields; BUSDV2 (live departures) and GTFSG2 (the timetable zip) each
// hand out their own token, good for about a day.

import { parseDvClock, parseDvDateTime } from './time.js';

const BASE = process.env.NJT_BASE_URL || 'https://pcsdata.njtransit.com/api';
const USERNAME = process.env.NJT_USERNAME;
const PASSWORD = process.env.NJT_PASSWORD;
const TOKEN_MS = 12 * 3600 * 1000;

if (!USERNAME || !PASSWORD) console.warn('NJT_USERNAME / NJT_PASSWORD are not set — NJ Transit calls will fail.');

const tokens = new Map(); // api → { token, at } or { pending }

async function post(api, call, fields, timeoutMs = 20000) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v ?? '');
  const res = await fetch(`${BASE}/${api}/${call}`, { method: 'POST', body: form, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${api}/${call}: HTTP ${res.status}`);
  return res;
}

async function token(api, fresh = false) {
  const cached = tokens.get(api);
  if (!fresh && cached?.token && Date.now() - cached.at < TOKEN_MS) return cached.token;
  if (cached?.pending) return cached.pending;
  const pending = (async () => {
    const body = await (await post(api, 'authenticateUser', { username: USERNAME, password: PASSWORD })).json();
    if (String(body.Authenticated).toLowerCase() !== 'true' || !body.UserToken) throw new Error(`${api}: login refused`);
    tokens.set(api, { token: body.UserToken, at: Date.now() });
    return body.UserToken;
  })();
  tokens.set(api, { pending });
  try {
    return await pending;
  } catch (err) {
    tokens.delete(api);
    throw err;
  }
}

const invalidToken = (body) => /invalid token/i.test(JSON.stringify(body?.message ?? body?.errorMessage ?? ''));

// One retry with a fresh token when NJ Transit says the token is no good.
async function callJson(api, call, fields) {
  for (const fresh of [false, true]) {
    const body = await (await post(api, call, { token: await token(api, fresh), ...fields })).json();
    if (!invalidToken(body)) return body;
  }
  throw new Error(`${api}/${call}: token refused`);
}

export async function downloadGtfs() {
  for (const fresh of [false, true]) {
    const res = await post('GTFSG2', 'getGTFS', { token: await token('GTFSG2', fresh) }, 180000);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A zip starts with "PK"; anything else is an error message.
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return bytes;
    const text = new TextDecoder().decode(bytes.slice(0, 500));
    if (!/token/i.test(text)) throw new Error(`getGTFS: ${text}`);
  }
  throw new Error('getGTFS: token refused');
}

const empty = (v) => v === null || v === undefined || v === '' || v === 'EMPTY' || v === 'N/A';

// Live departures from one stop over about the next hour, keyed by trip id.
// `live` is true only when NJ Transit is tracking the bus ("in 4 mins",
// "All Aboard"); otherwise departurestatus is just the scheduled clock time.
export async function liveDepartures(stopCode) {
  const body = await callJson('BUSDV2', 'getBusDV', { stop: stopCode, direction: '', route: '', IP: '' });
  const now = Date.now();
  const out = new Map();
  for (const t of body?.DVTrip || []) {
    const status = String(t.departurestatus || '').trim();
    const scheduled = parseDvDateTime(t.sched_dep_time);
    const mins = /^in (\d+) min/i.exec(status);
    let at = null;
    let live = false;
    if (/all aboard|boarding|now/i.test(status)) {
      at = now;
      live = true;
    } else if (mins) {
      at = parseDvClock(t.departuretime, scheduled ?? now) ?? now + +mins[1] * 60000;
      live = true;
    } else {
      at = parseDvClock(t.departuretime, scheduled ?? now) ?? scheduled;
    }
    out.set(String(t.internal_trip_number), {
      at,
      scheduled,
      live,
      status,
      gate: empty(t.lanegate) ? null : String(t.lanegate),
      load: empty(t.passload) ? null : String(t.passload),
      vehicle: empty(t.vehicle_id) ? null : String(t.vehicle_id),
      header: String(t.header || '').trim(),
    });
  }
  return out;
}
