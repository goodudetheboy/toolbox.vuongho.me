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

/** Minutes until `at`, to the nearest minute (as NJ Transit counts), never negative. */
export const minutesUntil = (at: number, now: number) => Math.max(0, Math.round((at - now) / 60000));

/** "200_1" → "200-1", the way NJ Transit writes Port Authority gates. */
export const gateText = (gate: string) => gate.replace(/_/g, '-');

/** Stop names stay whole, cross street included: two stops on the same street
 * ("BOULEVARD EAST AT 48TH ST", "… AT 49TH ST") only differ after "AT". */
export const shortName = (name: string) => (/PORT AUTHORITY BUS TERMINAL/.test(name) ? 'PORT AUTHORITY' : name);

/** "48TH ST AT BERGENLINE AVE" → "48TH ST", "PORT AUTHORITY…" → "PABT": only
 * for the one-line list heading, next to the full names above it. */
export const tinyName = (name: string) => (/PORT AUTHORITY/.test(name) ? 'PABT' : name.split(/ AT | & /)[0]);
