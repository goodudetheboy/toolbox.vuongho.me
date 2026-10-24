import { useEffect, useRef, useState } from 'react';
import { nearestStops, searchStops, type Stop } from '../lib/api';
import { toSaved, type SavedStop, type Trip } from '../lib/saved';

interface Props {
  initial: Trip | null;
  onGo: (trip: Trip) => void;
}

export default function Setup({ initial, onGo }: Props) {
  const [home, setHome] = useState<SavedStop | null>(initial?.home ?? null);
  const [dest, setDest] = useState<SavedStop | null>(initial?.dest ?? null);

  return (
    <main className="screen setup">
      <div className="setup-top">
        <div className="label">BUS</div>
        <a className="small" href="/">
          TOOLBOX
        </a>
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

// "TO NEW YORK · 86 · 89 · 156": where buses from here go, so the two sides of
// the same street can be told apart.
function describe(stop: SavedStop) {
  // A terminal sees buses to everywhere; one headsign would mislead.
  const head = stop.headsigns[0] && stop.routes.length <= 6 ? `TO ${stop.headsigns[0].replace(/ VIA .*/, '')}` : '';
  const routes = stop.routes.slice(0, 6).join(' · ') + (stop.routes.length > 6 ? ' …' : '');
  return [head, routes].filter(Boolean).join(' · ');
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
          STOP #{value.code} · {describe(value)}
        </div>
      ) : null}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((s) => (
            <li key={s.code}>
              <button onClick={() => pick(s)}>
                <span className="name">{s.name}</span>
                <span className="small">
                  {s.meters !== undefined ? `${s.meters} M · ` : ''}#{s.code} · {describe(s)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
