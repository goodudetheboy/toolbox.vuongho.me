import { useState } from 'react';
import type { Bus, Departures } from '../lib/api';
import { clockSecText, clockText } from '../lib/format';

// The stats-for-nerds sheet behind the nerd button at the bottom of the board: what each
// NJ Transit feed said about every bus, so a bus that shows as tracked but
// never comes can be traced to the feed that got it wrong (ADR 0004).

const SOURCE = { busdv: 'NJT APP', gps: 'GPS ONLY', timetable: 'TIMETABLE' } as const;

const ago = (ms: number, now: number) => {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 90 ? `${s} S AGO` : `${Math.round(s / 60)} MIN AGO`;
};

const away = (m: number) => (m < 1000 ? `${m} M` : `${(m / 1000).toFixed(1)} KM`);

const late = (bus: Bus) => {
  const m = Math.round((bus.at - bus.scheduled) / 60000);
  return m === 0 ? 'ON TIME' : m > 0 ? `${m} MIN LATE` : `${-m} MIN EARLY`;
};

export function NerdIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="M8.5 13.5A15 15 0 0 1 31.5 13.5M6.5 27A15 15 0 0 0 33.5 27" />
      <path d="M3 15.5h34M5 15.5l1 9h11l1-9M22 15.5l1 9h11l1-9" strokeLinejoin="round" />
      <circle cx="12" cy="20" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="28" cy="20" r="2.2" fill="currentColor" stroke="none" />
      <path d="M13 26c4.3 2.6 9.7 2.6 14 0" strokeLinecap="round" />
      <path d="M16.8 27.8v2.7a1.3 1.3 0 0 0 1.3 1.3h3.8a1.3 1.3 0 0 0 1.3-1.3v-2.7M20 28.2v3.6" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function Stats({ data, now, onClose }: { data: Departures | null; now: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard
      ?.writeText(JSON.stringify({ copiedAt: new Date().toISOString(), ...data }, null, 2))
      .then(() => setCopied(true))
      .catch(() => {});
  }

  const d = data?.debug;
  return (
    // Taps in here never count toward the board's double-tap flip.
    <div className="stats" role="dialog" aria-label="Stats for nerds" onPointerUp={(e) => e.stopPropagation()}>
      <div className="stats-head">
        <div className="label">STATS FOR NERDS</div>
        <button className="flip" onClick={onClose} aria-label="Close stats for nerds">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>

      {!data?.debug ? (
        <p className="small">ONE SEC…</p>
      ) : (
        <>
          <dl className="stats-feeds">
            <dt>UPDATED</dt>
            <dd>{clockSecText(data.now)}</dd>
            <dt>NJT APP FEED</dt>
            <dd>{data.liveOk ? 'OK' : 'FAILED'} · STOP {d?.busdvStops.join(', ') || '—'}</dd>
            <dt>GTFS-REALTIME</dt>
            <dd>
              {d?.realtimeError
                ? `FAILED: ${d.realtimeError.toUpperCase()}`
                : d?.realtimeAt
                  ? `OK · ${ago(d.realtimeAt, now)} · ${d.gpsBuses} BUSES ON GPS`
                  : '—'}
            </dd>
          </dl>

          {data.buses.map((b) => {
            const x = b.debug;
            return (
              <div key={`${b.trip}-${b.scheduled}`} className="stats-bus">
                <div className="stats-bus-top">
                  <strong>{b.route}</strong>
                  <span>{clockText(b.at)}</span>
                  {x && <span className="sched-tag">{SOURCE[x.source]}</span>}
                </div>
                <dl>
                  <dt>TRIP</dt>
                  <dd>
                    {b.trip} · SCHED {clockText(b.scheduled)} · {late(b)}
                  </dd>
                  {x && (
                    <>
                      <dt>NJT APP</dt>
                      <dd>
                        {x.busdv
                          ? `“${x.busdv.status.toUpperCase()}”${x.busdv.vehicle ? ` · BUS #${x.busdv.vehicle}` : ''}`
                          : 'NOT LISTED'}
                      </dd>
                      <dt>GPS</dt>
                      <dd>
                        {x.gps
                          ? `BUS #${x.gps.vehicle ?? '?'}${x.gps.meters != null ? ` · ${away(x.gps.meters)} AWAY` : ''} · ${ago(x.gps.at, now)}`
                          : 'NO BUS ON THIS TRIP'}
                      </dd>
                      <dt>PREDICTED</dt>
                      <dd>{x.predicted ? clockSecText(x.predicted) : '—'}</dd>
                    </>
                  )}
                </dl>
              </div>
            );
          })}

          <button className="stats-copy" onClick={copy}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </>
      )}
    </div>
  );
}
