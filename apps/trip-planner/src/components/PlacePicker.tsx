import { useEffect, useRef, useState } from 'react';
import { autocompletePlaces, getPlace, newSessionToken, type PlaceSuggestion } from '../lib/places';
import type { ActivityPlace } from '../types';

interface PlacePickerProps {
  value: ActivityPlace | undefined;
  onChange: (place: ActivityPlace | undefined) => void;
}

/** Google Maps place search: type, pick a suggestion, and the place is attached to the activity. */
export default function PlacePicker({ value, onChange }: PlacePickerProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionToken = useRef(newSessionToken());

  useEffect(() => {
    const input = query.trim();
    if (input.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      autocompletePlaces(input, sessionToken.current, controller.signal)
        .then((results) => {
          setSuggestions(results);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function pick(suggestion: PlaceSuggestion) {
    setLoading(true);
    try {
      const place = await getPlace(suggestion.placeId, sessionToken.current);
      onChange(place);
      setQuery('');
      setSuggestions([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      sessionToken.current = newSessionToken();
      setLoading(false);
    }
  }

  if (value) {
    return (
      <div className="place-selected">
        <a href={value.mapsUrl} target="_blank" rel="noreferrer">
          📍 {value.name}
        </a>
        {value.address && <span className="place-address">{value.address}</span>}
        <button type="button" className="link-button" onClick={() => onChange(undefined)}>
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="place-picker">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter shouldn't submit the whole activity form from the search box.
          if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestions[0]) void pick(suggestions[0]);
          }
        }}
        placeholder="Search Google Maps, e.g. Ichiran Shibuya"
      />
      {loading && <p className="hint">Loading place…</p>}
      {error && <p className="error">{error}</p>}
      {suggestions.length > 0 && !loading && (
        <ul className="place-suggestions">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button type="button" onClick={() => void pick(s)}>
                <span className="place-main">{s.mainText}</span>
                {s.secondaryText && <span className="place-secondary">{s.secondaryText}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
