import type { Bus } from '../lib/api';
import type { Settings as SettingsT } from '../lib/saved';
import Tile from './Tile';

// The settings sheet behind the gear next to the nerd button: what the tiles
// show besides the time and route, with a preview of two tiles stuck to the
// bottom so each switch shows what it does.

export function GearIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      {/* Teeth: a thick dashed ring. */}
      <circle cx="12" cy="12" r="8.5" strokeWidth="4" strokeDasharray="3.34 3.34" />
      <circle cx="12" cy="12" r="6" strokeWidth="2.6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const OPTIONS: { key: keyof SettingsT; title: string; text: string }[] = [
  { key: 'crowd', title: 'HOW FULL', text: 'A row of people: one empty, two half full, three full. Only for buses NJ Transit’s app tracks.' },
  { key: 'busId', title: 'BUS NUMBER', text: 'The number painted on the bus, when NJ Transit knows which bus it is.' },
];

interface Props {
  settings: SettingsT;
  onChange: (s: SettingsT) => void;
  /** The next real bus, so the preview looks like this trip. */
  sample?: Bus;
  from: string;
  now: number;
  onClose: () => void;
}

export default function Settings({ settings, onChange, sample, from, now, onClose }: Props) {
  const base: Bus = {
    trip: 'preview',
    route: sample?.route ?? '125',
    headsign: sample?.headsign ?? 'JOURNAL SQUARE',
    at: now + 6 * 60 * 1000,
    scheduled: now + 6 * 60 * 1000,
    live: true,
    gate: sample?.gate ?? null,
    load: 'FULL',
    vehicle: '6386',
    stop: { code: from, name: '' },
  };
  const preview: Bus[] = [base, { ...base, at: now + 18 * 60 * 1000, load: 'HALF_EMPTY', vehicle: '21221' }];

  return (
    // Taps in here never count toward the board's double-tap flip.
    <div className="stats settings" role="dialog" aria-label="Settings" onPointerUp={(e) => e.stopPropagation()}>
      <div className="stats-head">
        <div className="label">SETTINGS</div>
        <button className="flip" onClick={onClose} aria-label="Close settings">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="small settings-group">ON EVERY BUS</div>
      {OPTIONS.map((o) => (
        <button key={o.key} className="toggle" role="switch" aria-checked={settings[o.key]} onClick={() => onChange({ ...settings, [o.key]: !settings[o.key] })}>
          <span className="toggle-text">
            <strong>{o.title}</strong>
            <span>{o.text}</span>
          </span>
          <span className={`switch${settings[o.key] ? ' on' : ''}`} aria-hidden="true">
            <span />
          </span>
        </button>
      ))}

      <div className="settings-preview">
        <div className="small">PREVIEW</div>
        {preview.map((b, i) => (
          <Tile key={i} bus={b} now={now} solid={i === 0} next={false} from={from} settings={settings} />
        ))}
      </div>
    </div>
  );
}
