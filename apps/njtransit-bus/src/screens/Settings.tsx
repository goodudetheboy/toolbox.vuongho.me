import { useState } from 'react';
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

function InfoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 11v6" strokeLinecap="square" />
      <circle cx="12" cy="7.2" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const OPTIONS: { key: keyof SettingsT; title: string; text: string }[] = [
  { key: 'crowd', title: 'HOW FULL', text: 'One person empty, two half full, three full. Only on buses NJ Transit tracks.' },
  { key: 'busId', title: 'TRACKING #', text: 'The number on the bus itself, when NJ Transit knows which one it is.' },
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
  // Which option's explanation is showing (tap the info button to toggle).
  const [info, setInfo] = useState<keyof SettingsT | null>(null);
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
        <div key={o.key} className="toggle">
          <div className="toggle-text">
            <div className="toggle-title">
              <strong>{o.title}</strong>
              <button
                className="info"
                onClick={() => setInfo(info === o.key ? null : o.key)}
                aria-label={`What is ${o.title}?`}
                aria-expanded={info === o.key}
              >
                <InfoIcon />
              </button>
            </div>
            {info === o.key && <div className="tip">{o.text}</div>}
          </div>
          <button
            className={`switch${settings[o.key] ? ' on' : ''}`}
            role="switch"
            aria-checked={settings[o.key]}
            aria-label={o.title}
            onClick={() => onChange({ ...settings, [o.key]: !settings[o.key] })}
          >
            <span />
          </button>
        </div>
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
