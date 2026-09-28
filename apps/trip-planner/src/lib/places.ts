import type { ActivityPlace } from '../types';

// Browser key for the Places API (New) — safe to commit, like the Firebase
// config. It's restricted server-side to places.googleapis.com and to HTTP
// referrers on toolbox.vuongho.me (+ the Hosting default domains and the
// local dev/serve ports), so it's useless to anyone who copies it elsewhere.
const PLACES_API_KEY = 'AIzaSyDZXUGBceGq5zzmbXBhAIy_n4nsg7oXWqo';
const BASE = 'https://places.googleapis.com/v1';

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

/**
 * One autocomplete "session": the keystroke requests plus the final details
 * lookup share a token, which Google bills as a single session rather than
 * per keystroke. Start a new one after each pick.
 */
export function newSessionToken(): string {
  return crypto.randomUUID();
}

export async function autocompletePlaces(
  input: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_API_KEY },
    body: JSON.stringify({ input, sessionToken }),
    signal,
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status}).`);
  const data = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
        text?: { text: string };
      };
    }[];
  };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondaryText: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export async function getPlace(placeId: string, sessionToken: string): Promise<ActivityPlace> {
  const params = new URLSearchParams({ sessionToken });
  const res = await fetch(`${BASE}/places/${encodeURIComponent(placeId)}?${params}`, {
    headers: {
      'X-Goog-Api-Key': PLACES_API_KEY,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,googleMapsUri',
    },
  });
  if (!res.ok) throw new Error(`Couldn't load that place (${res.status}).`);
  const p = (await res.json()) as {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    googleMapsUri?: string;
  };
  return {
    placeId: p.id,
    name: p.displayName?.text ?? '',
    address: p.formattedAddress ?? '',
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    mapsUrl:
      p.googleMapsUri ??
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName?.text ?? '')}&query_place_id=${p.id}`,
  };
}
