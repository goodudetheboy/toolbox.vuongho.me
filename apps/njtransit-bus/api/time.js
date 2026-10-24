// NJ Transit runs on New York time; everything here converts between that wall
// clock and epoch milliseconds without assuming the server's own time zone.

const TZ = 'America/New_York';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function nyParts(ms) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(ms))) p[type] = Number(value);
  return p;
}

// Offset (ms) of New York from UTC at the given instant: -4h in summer, -5h in winter.
function nyOffset(ms) {
  const p = nyParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Epoch ms of a New York wall-clock time.
export function nyTime(year, month, day, hour = 0, minute = 0, second = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - nyOffset(guess);
  return guess - nyOffset(first);
}

// "YYYYMMDD" of the New York calendar day containing ms.
export function nyDate(ms) {
  const p = nyParts(ms);
  return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
}

export function addDays(yyyymmdd, n) {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + n));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 0 = Monday … 6 = Sunday, matching calendar.txt's column order.
export function weekday(yyyymmdd) {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  return (d.getUTCDay() + 6) % 7;
}

// GTFS times count from "noon minus 12 hours" of the service day, which is
// midnight except on daylight-saving change days.
export function serviceDayStart(yyyymmdd) {
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6);
  const d = +yyyymmdd.slice(6, 8);
  return nyTime(y, m, d, 12) - 12 * 3600 * 1000;
}

// "10/24/2026 09:20:37 AM" (BUSDV2's sched_dep_time) → epoch ms.
export function parseDvDateTime(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)$/i.exec((s || '').trim());
  if (!m) return null;
  let h = +m[4] % 12;
  if (m[7].toUpperCase() === 'PM') h += 12;
  return nyTime(+m[3], +m[1], +m[2], h, +m[5], +(m[6] || 0));
}

// "09:26 AM" (BUSDV2's departuretime) → the epoch ms closest to `near`, so a
// bus scheduled for 11:58 PM but leaving at 12:03 AM lands on the next day.
export function parseDvClock(s, near) {
  const m = /^(\d{1,2}):(\d{2}) ?([AP]M)$/i.exec((s || '').trim());
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  const day = nyDate(near);
  let best = null;
  for (const offset of [-1, 0, 1]) {
    const dd = addDays(day, offset);
    const t = nyTime(+dd.slice(0, 4), +dd.slice(4, 6), +dd.slice(6, 8), h, +m[2]);
    if (best === null || Math.abs(t - near) < Math.abs(best - near)) best = t;
  }
  return best;
}
