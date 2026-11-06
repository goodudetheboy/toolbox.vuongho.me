import { useRef } from 'react';
import type { Alert } from '../lib/api';
import { clockText } from '../lib/format';

// NJ Transit's service alerts about the board's buses: a red strip across the
// top of the board with the alerts running through it, and behind it a red
// sheet with each one in full. Which alerts belong to a board is the API's
// call (api/alerts.js).

const cancelled = (a: Alert) => a.trips.length > 0 && /not operate|cancel/i.test(a.text);

function WarnIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3L2 21h20z" />
      <path d="M12 10v5M12 17.5v.5" strokeLinecap="square" />
    </svg>
  );
}

export function AlertBanner({ alerts, onOpen }: { alerts: Alert[]; onOpen: () => void }) {
  const line = alerts.map((a) => a.text.toUpperCase()).join('   ✱   ');
  // Same reading speed whatever the length: about 9 characters a second.
  const seconds = Math.max(8, (line.length + 7) / 9);
  return (
    <button className="alert-banner" onClick={onOpen} aria-label={`${alerts.length} service alert${alerts.length > 1 ? 's' : ''}: ${line}. Show details`}>
      <span className="alert-banner-tag">
        <WarnIcon />
        {alerts.length > 1 && <strong>{alerts.length}</strong>}
      </span>
      <span className="alert-banner-run" aria-hidden="true">
        <span className="alert-banner-track" style={{ animationDuration: `${seconds}s` }}>
          <span>{line}&nbsp;&nbsp;&nbsp;✱&nbsp;&nbsp;&nbsp;</span>
          <span>{line}&nbsp;&nbsp;&nbsp;✱&nbsp;&nbsp;&nbsp;</span>
        </span>
      </span>
    </button>
  );
}

// How far past the end a pull has to go to get back to the board (twice this
// for a mouse wheel or trackpad, whose steps are bigger).
const PULL_PX = 80;

interface Props {
  alerts: Alert[];
  updated: number | null;
  /** Sliding back up (the board's close animation); `onGone` once it's off screen. */
  leaving: boolean;
  onClose: () => void;
  onGone: () => void;
}

// The sheet sits above the board: it slides down from the top while the board
// moves down out of the way, as if the screen scrolled up to it (styles.css).
// Pulling on past the last alert goes back down to the board, the same slide
// as the close button.
export default function Alerts({ alerts, updated, leaving, onClose, onGone }: Props) {
  // A pull only counts when it starts with the sheet already at its end, so a
  // scroll (or a fling) that just reaches the end doesn't close it too.
  const touchFrom = useRef<number | null>(null); // finger's y when the pull began
  const wheel = useRef<{ sum: number; at: number } | null>(null);
  const atEnd = (el: HTMLElement) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  const close = () => {
    touchFrom.current = null;
    wheel.current = null;
    if (!leaving) onClose();
  };

  return (
    // Taps in here never count toward the board's double-tap flip.
    <div
      className={`stats alerts${leaving ? ' leaving' : ''}`}
      role="dialog"
      aria-label="Service alerts"
      onTouchStart={(e) => (touchFrom.current = atEnd(e.currentTarget) ? e.touches[0].clientY : null)}
      onTouchMove={(e) => touchFrom.current !== null && touchFrom.current - e.touches[0].clientY > PULL_PX && close()}
      onWheel={(e) => {
        // A wheel or trackpad gesture is a run of events; a pause starts a new one.
        const w = wheel.current;
        const fresh = !w || e.timeStamp - w.at > 250;
        if (fresh && !atEnd(e.currentTarget)) return void (wheel.current = { sum: -Infinity, at: e.timeStamp });
        const sum = (fresh ? 0 : w.sum) + Math.max(0, e.deltaY);
        wheel.current = { sum, at: e.timeStamp };
        if (sum > PULL_PX * 2) close();
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onAnimationEnd={(e) => leaving && e.target === e.currentTarget && onGone()}
    >
      <div className="stats-head">
        <div className="label">SERVICE ALERTS</div>
        <button className="flip" onClick={onClose} aria-label="Close service alerts">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      <div className="alerts-hero">
        <WarnIcon />
        <strong>{alerts.length === 0 ? 'ALL CLEAR' : alerts.length === 1 ? 'HEADS UP' : `${alerts.length} ALERTS`}</strong>
      </div>

      {alerts.length === 0 && <p className="alerts-text">NJ Transit has nothing to say about these buses right now.</p>}

      {alerts.map((a, i) => (
        <div key={`${a.id}-${i}`} className={`alerts-item${i % 2 === 0 ? ' solid' : ''}`}>
          <div className="alerts-item-top">
            {a.routes.length > 0 && <strong>{a.routes.join(' · ')}</strong>}
            {cancelled(a) && <span className="alerts-tag">CANCELLED</span>}
          </div>
          <p className="alerts-text">{a.text}</p>
          {a.at && <div className="small">{cancelled(a) ? 'WAS DUE HERE' : 'DUE HERE'} {clockText(a.at)}</div>}
        </div>
      ))}

      <div className="small alerts-foot">FROM NJ TRANSIT{updated ? ` · UPDATED ${clockText(updated)}` : ''}</div>
    </div>
  );
}
