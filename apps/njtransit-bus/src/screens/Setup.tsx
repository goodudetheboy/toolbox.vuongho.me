import { useEffect, useRef, useState } from 'react';
import { nearestStops, searchStops, type Stop } from '../lib/api';
import { shortName } from '../lib/format';
import { loadBookmarks, saveBookmarks, sameTrip, toSaved, type Bookmark, type SavedStop, type Trip } from '../lib/saved';

interface Props {
  initial: Trip | null;
  onGo: (trip: Trip) => void;
}

export default function Setup({ initial, onGo }: Props) {
  const [home, setHome] = useState<SavedStop | null>(initial?.home ?? null);
  const [dest, setDest] = useState<SavedStop | null>(initial?.dest ?? null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);

  function remove(b: Bookmark) {
    const next = bookmarks.filter((x) => !sameTrip(x, b));
    setBookmarks(next);
    saveBookmarks(next);
  }

  const [showSaved, setShowSaved] = useState(false);

  if (showSaved) {
    return (
      <main className="screen setup">
        <div className="setup-top">
          <div className="label">SAVED</div>
          <button className="icon-btn" onClick={() => setShowSaved(false)} aria-label="Close saved trips">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {bookmarks.length > 0 ? (
          <ul className="saved">
            {bookmarks.map((b, i) => (
              <li key={`${b.home.code}-${b.dest.code}`} className={i % 2 === 0 ? 'solid' : ''}>
                <button className="saved-go" onClick={() => onGo({ ...b, back: false })}>
                  {shortName(b.home.name)}
                  <br />→ {shortName(b.dest.name)}
                </button>
                <button className="saved-x" onClick={() => remove(b)} aria-label={`Remove ${shortName(b.home.name)} to ${shortName(b.dest.name)}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="small">NOTHING SAVED YET. TAP THE BOOKMARK ON A TRIP’S BUS SCREEN TO SAVE IT.</div>
        )}
      </main>
    );
  }

  return (
    <main className="screen setup">
      <div className="setup-top">
        <div className="label">BUS</div>
        <div className="setup-top-right">
          <a className="small" href="/">
            TOOLBOX
          </a>
          <button className="icon-btn" onClick={() => setShowSaved(true)} aria-label={`Saved trips (${bookmarks.length})`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M6 3h12v18l-6-5-6 5z" />
            </svg>
          </button>
        </div>
      </div>
      <StopField id="home" label="HOME" value={home} onPick={setHome} />
      <StopField id="dest" label="TO" value={dest} onPick={setDest} />
      <button
        className="go"
        disabled={!home || !dest || home.code === dest.code}
        onClick={() => home && dest && onGo({ home, dest, back: initial?.back ?? false })}
      >
        <span>GO</span>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true">
          <path d="M4 12h15M13 6l6 6-6 6" />
        </svg>
      </button>
    </main>
  );
}

// "#21689 · TO NEW YORK · 86 · 89 · 156": where buses from here go, so the two
// sides of the same street can be told apart. A terminal like Port Authority
// sees dozens of routes going everywhere, so it gets just its number.
function describe(stop: SavedStop) {
  const parts = [`#${stop.code}`];
  if (stop.routes.length <= 6) {
    if (stop.headsigns[0]) parts.push(`TO ${stop.headsigns[0].replace(/ VIA .*/, '')}`);
    parts.push(...stop.routes);
  }
  return parts.join(' · ');
}

function StopField({
  id,
  label,
  value,
  onPick,
}: {
  id: string;
  label: string;
  value: SavedStop | null;
  onPick: (s: SavedStop) => void;
}) {
  const [text, setText] = useState(value?.name ?? '');
  const [results, setResults] = useState<Stop[] | null>(null);
  const [status, setStatus] = useState('');
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setStatus('SEARCHING…');
      searchStops(q, ctrl.signal)
        .then((stops) => {
          setResults(stops);
          setStatus(stops.length ? '' : 'NO STOPS MATCH');
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) setStatus(`CAN'T SEARCH: ${err.message}`.toUpperCase());
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text]);

  function nearMe() {
    if (!navigator.geolocation) return setStatus('LOCATION ISN’T AVAILABLE');
    setStatus('FINDING YOU…');
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        nearestStops(pos.coords.latitude, pos.coords.longitude)
          .then((stops) => {
            setResults(stops);
            setStatus('');
          })
          .catch((err) => setStatus(`CAN'T SEARCH: ${err.message}`.toUpperCase())),
      () => setStatus('LOCATION WAS BLOCKED'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function pick(stop: Stop) {
    typed.current = false;
    setText(stop.name);
    setResults(null);
    setStatus('');
    onPick(toSaved(stop));
  }

  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <button className="near" onClick={nearMe}>
          NEAR ME
        </button>
      </div>
      <input
        id={id}
        type="text"
        value={text}
        placeholder="Stop name or number"
        autoComplete="off"
        enterKeyHint="search"
        // Select the whole name on tap so typing replaces it. Done a frame
        // later because mobile browsers place the caret after focus fires.
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() => el.setSelectionRange(0, el.value.length));
        }}
        onChange={(e) => {
          typed.current = true;
          setText(e.target.value);
        }}
      />
      {status ? (
        <div className="small" role="status">
          {status}
        </div>
      ) : value && !results ? (
        <div className="small">
          STOP {describe(value)}
        </div>
      ) : null}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((s) => (
            <li key={s.code}>
              <button onClick={() => pick(s)}>
                <span className="name">{s.name}</span>
                <span className="small">
                  {s.meters !== undefined ? `${s.meters} M · ` : ''}
                  {describe(s)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
