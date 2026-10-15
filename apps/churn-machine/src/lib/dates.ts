// Calendar dates as 'YYYY-MM-DD' strings, with UTC math so DST never shifts a day.

const DAY = 86_400_000;

export function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayIso(now = new Date()): string {
  // The user's local calendar day, not UTC's.
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY);
}

export function maxIso(a: string, b: string): string {
  return a > b ? a : b;
}

/** "Oct 24" (adds the year when it isn't `relativeTo`'s year). */
export function shortDate(iso: string, relativeTo?: string): string {
  const d = toDate(iso);
  const sameYear = !relativeTo || relativeTo.slice(0, 4) === iso.slice(0, 4);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function monthLabel(iso: string): string {
  return toDate(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The next given weekday (0 = Sunday … 5 = Friday) on or after `from`. */
export function nextWeekday(from: string, weekday: number): string {
  const d = toDate(from);
  return addDays(from, (weekday - d.getUTCDay() + 7) % 7);
}
