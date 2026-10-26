import type { Bus } from '../lib/api';
import { clock, clockText, gateText, minutesUntil, shortName } from '../lib/format';
import type { Settings } from '../lib/saved';

// One bus in the board's list (and the settings sheet's preview).

const CROWD: Record<string, { people: number; text: string }> = {
  EMPTY: { people: 1, text: 'EMPTY' },
  HALF_EMPTY: { people: 2, text: 'HALF FULL' },
  FULL: { people: 3, text: 'FULL' },
};

function Person({ on }: { on: boolean }) {
  return (
    <svg width="16" height="22" viewBox="0 0 16 22" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="8" cy="5" r="4" />
      <path d="M1 21v-5a7 7 0 0 1 14 0v5z" strokeLinejoin="round" />
    </svg>
  );
}

/** How full the bus is: filled people out of three. Nothing when NJ Transit doesn't say. */
export function Crowd({ load }: { load: string | null }) {
  const c = load ? CROWD[load] : undefined;
  if (!c) return null;
  return (
    <div className="crowd" role="img" aria-label={c.text}>
      {[1, 2, 3].map((n) => (
        <Person key={n} on={n <= c.people} />
      ))}
    </div>
  );
}

interface Props {
  bus: Bus;
  now: number;
  solid: boolean;
  next: boolean;
  from: string;
  settings: Settings;
}

export default function Tile({ bus, now, solid, next, from, settings }: Props) {
  const mins = minutesUntil(bus.at, now);
  const c = clock(bus.at);
  return (
    <div className={`tile${solid ? ' solid' : ''}`}>
      <div className="left">
        {next && <div className="tag">NEXT</div>}
        {bus.live ? (
          <>
            <div className="when">{mins === 0 ? 'NOW' : <>{mins}<small> MIN</small></>}</div>
            <div className="sub">{clockText(bus.at)}</div>
          </>
        ) : (
          <div className="when clock">
            {c.time}
            <small> {c.ampm}</small>
          </div>
        )}
      </div>
      <div className="right">
        <div className="rt">{bus.route}</div>
        {bus.gate ? (
          <div className="sub gate-sub">GATE {gateText(bus.gate)}</div>
        ) : (
          <div className="sub head">{bus.stop.code !== from ? `FROM ${shortName(bus.stop.name)}` : bus.headsign}</div>
        )}
        {settings.crowd && <Crowd load={bus.load} />}
        {settings.busId && bus.vehicle && <div className="sub">TRACKING #{bus.vehicle}</div>}
        {!bus.live && <div className="sched-tag">SCHED</div>}
      </div>
    </div>
  );
}
