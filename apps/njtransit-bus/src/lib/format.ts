// Display helpers. Everything is shown in upper case, in New York time.

const clockFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
});

/** "12:40 AM" → { time: "12:40", ampm: "AM" } */
export function clock(ms: number) {
  const parts = clockFmt.formatToParts(new Date(ms));
  const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { time: `${pick('hour')}:${pick('minute')}`, ampm: pick('dayPeriod').toUpperCase() };
}

export const clockText = (ms: number) => {
  const c = clock(ms);
  return `${c.time} ${c.ampm}`;
};

/** Whole minutes until `at`, never negative. */
export const minutesUntil = (at: number, now: number) => Math.max(0, Math.floor((at - now) / 60000));

/** "200_1" → "200-1", the way NJ Transit writes Port Authority gates. */
export const gateText = (gate: string) => gate.replace(/_/g, '-');

/** "48TH ST AT BERGENLINE AVE" → "48TH ST" for the small header. */
export const shortName = (name: string) => {
  if (/PORT AUTHORITY BUS TERMINAL/.test(name)) return 'PORT AUTHORITY';
  return name.split(/ AT | & /)[0];
};

/** "PORT AUTHORITY BUS TERMINAL" → "PABT" in tight spots. */
export const tinyName = (name: string) => (/PORT AUTHORITY/.test(name) ? 'PABT' : shortName(name));
