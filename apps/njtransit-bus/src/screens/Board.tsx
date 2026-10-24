import { useCallback, useEffect, useRef, useState } from 'react';
import { departures, type Bus, type Departures } from '../lib/api';
import { clock, clockText, gateText, minutesUntil, shortName, tinyName } from '../lib/format';
import { loadBookmarks, saveBookmarks, sameTrip, type Bookmark, type Trip } from '../lib/saved';
import Stats, { NerdIcon } from './Stats';

const REFRESH_MS = 20 * 1000;

interface Props {
  trip: Trip;
  onEdit: () => void;
  onFlip: () => void;
}

// Departures for the trip, refreshed every 20 s while the screen is visible.
// With `debug` (the stats sheet is open) each poll also brings the per-feed details.
function useDepartures(from: string, to: string, debug: boolean) {
  const [data, setData] = useState<Departures | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ctrl = useRef<AbortController | null>(null);
  const debugRef = useRef(debug);
  debugRef.current = debug;

  const load = useCallback(() => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    departures(from, to, c.signal, debugRef.current)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (!c.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
  }, [from, to]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      ctrl.current?.abort();
    };
  }, [load]);

  // Opening the sheet fetches its details right away instead of at the next poll.
  useEffect(() => {
    if (debug) load();
  }, [debug, load]);

  return { data, error, loading, retry: load };
}

function useNow(stepMs = 5000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(timer);
  }, [stepMs]);
  return now;
}

export default function Board({ trip, onEdit, onFlip }: Props) {
  const from = trip.back ? trip.dest : trip.home;
  const to = trip.back ? trip.home : trip.dest;
  const [stats, setStats] = useState(false);
  const { data, error, loading, retry } = useDepartures(from.code, to.code, stats);
  const now = useNow();
  const [wipe, setWipe] = useState<{ color: string; key: number } | null>(null);
  const [bookmark, setBookmark] = useState<Bookmark | null>(() => loadBookmarks().find((b) => sameTrip(b, trip)) ?? null);
  const [naming, setNaming] = useState(false);
  const saved = bookmark !== null;

  // Saving keeps the bookmark's place in the list when it's only being renamed.
  function saveBookmark(title: string) {
    const list = loadBookmarks();
    const b: Bookmark = { home: trip.home, dest: trip.dest, ...(title && { title }) };
    const i = list.findIndex((x) => sameTrip(x, trip));
    if (i >= 0) list[i] = { ...b, home: list[i].home, dest: list[i].dest };
    else list.push(b);
    saveBookmarks(list);
    setBookmark(i >= 0 ? list[i] : b);
    setNaming(false);
  }

  function removeBookmark() {
    saveBookmarks(loadBookmarks().filter((b) => !sameTrip(b, trip)));
    setBookmark(null);
    setNaming(false);
  }
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLElement>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  // Double tap anywhere (not on a button) flips, like the watch app. Detected
  // by hand: phone browsers don't reliably fire dblclick on touch.
  function onTap(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const prev = lastTap.current;
    const now = e.timeStamp;
    if (prev && now - prev.t < 350 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 40) {
      lastTap.current = null;
      flip();
    } else {
      lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  }

  function flip() {
    setWipe({ color: trip.back ? '#005097' : '#ffffff', key: Date.now() });
    scroller.current?.scrollTo({ top: 0, behavior: 'instant' });
    onFlip();
  }

  const buses = (data?.buses ?? []).filter((b) => b.at >= now - 60 * 1000);
  const first = buses[0];
  const anyLive = buses.some((b) => b.live);
  const fromName = data?.from.name ?? from.name;
  const toName = data?.to.name ?? to.name;

  return (
    <div className={`screen${trip.back ? ' back' : ''}`} onPointerUp={onTap}>
      <div className="scroller" ref={scroller}>
        <section className="hero">
          <div className="top">
            <button className="where" onClick={onEdit} aria-label="Change stops">
              {bookmark?.title && <span className="where-title">{bookmark.title}</span>}
              {shortName(fromName)}
              <br />→ {shortName(toName)}
            </button>
            <div className="top-buttons">
              <button
                className={`flip${saved ? ' on' : ''}`}
                onClick={() => setNaming(true)}
                aria-label={saved ? 'Edit bookmark' : 'Bookmark this trip'}
                aria-pressed={saved}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M6 3h12v18l-6-5-6 5z" />
                </svg>
              </button>
              <button className="flip" onClick={flip} aria-label="Flip direction">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
                  <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />
                </svg>
              </button>
            </div>
          </div>

          {first ? (
            <>
              {!first.live && (
                <div className="sched-box">
                  <strong>SCHEDULED</strong>
                  <span>
                    {anyLive
                      ? 'This bus isn’t being tracked yet. Its time is from the timetable.'
                      : data?.liveOk === false
                        ? 'Live times aren’t available right now. Times are from the timetable.'
                        : 'No live buses yet. Times are from the timetable.'}
                  </span>
                </div>
              )}
              <div className="next">
                <div className="label">NEXT BUS</div>
                <BigTime bus={first} now={now} />
                {first.live && <div className="leaves">LEAVES {clockText(first.at)}</div>}
                <div className="route">
                  <strong>{first.route}</strong>
                  <span>TO {first.headsign}</span>
                </div>
                {first.stop.code !== from.code && <div className="small from-other">FROM {first.stop.name}</div>}
                {first.gate && (
                  <div className="gate">
                    <span>GATE</span>
                    <strong>{gateText(first.gate)}</strong>
                  </div>
                )}
              </div>
              <button className="more" onClick={() => list.current?.scrollIntoView({ behavior: 'smooth' })}>
                <span className="label">ALL BUSES</span>
                <svg className="nudge" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
                  <path d="M5 9l7 7 7-7" />
                </svg>
              </button>
            </>
          ) : (
            <div className="empty">
              {loading ? (
                <strong aria-live="polite">ONE SEC…</strong>
              ) : error ? (
                <>
                  <strong>NO SIGNAL</strong>
                  <div className="small">{error.toUpperCase()}</div>
                  <button onClick={retry}>TRY AGAIN</button>
                </>
              ) : (
                <>
                  <strong>NO BUSES</strong>
                  <div className="small">NOTHING GOES FROM HERE TO THERE IN THE NEXT DAY.</div>
                  <button onClick={onEdit}>CHANGE STOPS</button>
                </>
              )}
            </div>
          )}
        </section>

        {first && (
          <section className="list" ref={list}>
            <div className="list-head">
              <div className="label">ALL BUSES</div>
              <div className="small">
                {tinyName(fromName)} → {tinyName(toName)}
              </div>
            </div>
            {buses.map((b, i) => (
              <Tile key={`${b.trip}-${b.scheduled}`} bus={b} now={now} solid={i % 2 === 0} next={i === 0} from={from.code} />
            ))}
            <div className="foot small">
              <span className={`dot${anyLive ? '' : ' hollow'}`} />
              <span>
                {anyLive ? 'LIVE' : 'TIMETABLE · NOT LIVE'}
                {data ? ` · UPDATED ${clockText(data.now)}` : ''}
                {error ? ' · OFFLINE' : ''}
              </span>
              <button className="flip nerd" onClick={() => setStats(true)} aria-label="Stats for nerds">
                <NerdIcon />
              </button>
            </div>
          </section>
        )}
      </div>
      {stats && <Stats data={data} now={now} onClose={() => setStats(false)} />}
      {naming && (
        <NameSheet
          bookmark={bookmark}
          from={shortName(fromName)}
          to={shortName(toName)}
          onSave={saveBookmark}
          onRemove={removeBookmark}
          onClose={() => setNaming(false)}
        />
      )}
      {wipe && (
        <div key={wipe.key} className="wipe" style={{ background: wipe.color }} onAnimationEnd={() => setWipe(null)} aria-hidden="true" />
      )}
    </div>
  );
}

function BigTime({ bus, now }: { bus: Bus; now: number }) {
  if (!bus.live) {
    const c = clock(bus.at);
    return (
      <div className="big clock">
        <span className="num">{c.time}</span>
        <span className="unit">{c.ampm}</span>
      </div>
    );
  }
  const mins = minutesUntil(bus.at, now);
  if (mins === 0) {
    return (
      <div className="big word">
        <span className="num">NOW</span>
      </div>
    );
  }
  return (
    <div className={`big ${mins < 10 ? 'd1' : 'd2'}`}>
      <span className="num">{mins}</span>
      <span className="unit">MIN</span>
    </div>
  );
}

function Tile({ bus, now, solid, next, from }: { bus: Bus; now: number; solid: boolean; next: boolean; from: string }) {
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
        {!bus.live && <div className="sched-tag">SCHED</div>}
      </div>
    </div>
  );
}

// Bookmarking asks for an optional name, shown above the stop names on the
// board and in the saved list. Tapping the bookmark again renames or removes it.
function NameSheet({
  bookmark,
  from,
  to,
  onSave,
  onRemove,
  onClose,
}: {
  bookmark: Bookmark | null;
  from: string;
  to: string;
  onSave: (title: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(bookmark?.title ?? '');
  return (
    <div className="stats" role="dialog" aria-label="Bookmark" onPointerUp={(e) => e.stopPropagation()}>
      <div className="stats-head">
        <div className="label">{bookmark ? 'BOOKMARK' : 'SAVE TRIP'}</div>
        <button className="flip" onClick={onClose} aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
      </div>
      <form
        className="name-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(title.trim().toUpperCase());
        }}
      >
        <div className="small">
          {from}
          <br />→ {to}
        </div>
        <div className="field">
          <label htmlFor="bookmark-title" className="small">
            NAME (OPTIONAL)
          </label>
          <input
            id="bookmark-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.G. TO WORK"
            maxLength={40}
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
          />
        </div>
        <div className="name-buttons">
          <button type="submit" className="stats-copy">
            SAVE
          </button>
          {bookmark && (
            <button type="button" className="stats-copy" onClick={onRemove}>
              REMOVE
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
