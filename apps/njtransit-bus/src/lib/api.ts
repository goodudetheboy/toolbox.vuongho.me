// Talks to toolbox-njtransit-bus-api (apps/njtransit-bus/api). Its URL is baked
// in at build time by CI (VITE_NJTRANSIT_BUS_API_URL); dev uses a local copy.

const API_URL = (
  import.meta.env.VITE_NJTRANSIT_BUS_API_URL || (import.meta.env.DEV ? 'http://localhost:8080' : '')
).replace(/\/$/, '');

export interface Stop {
  code: string;
  name: string;
  lat: number;
  lon: number;
  routes: string[];
  headsigns: string[];
  meters?: number;
}

export interface Bus {
  trip: string;
  route: string;
  headsign: string;
  /** Epoch ms it leaves: NJ Transit's estimate when `live`, else the timetable's. */
  at: number;
  scheduled: number;
  /** NJ Transit is tracking this bus right now. */
  live: boolean;
  /** Port Authority-style gate, e.g. "200_1". */
  gate: string | null;
  /** How full it is: "EMPTY", "HALF_EMPTY" or "FULL" (NJ Transit's own app's buses only). */
  load: string | null;
  /** The bus's number (painted on it), when NJ Transit knows which bus runs the trip. */
  vehicle: string | null;
  /** The stop it leaves from (can be a nearby one, e.g. across the street). */
  stop: { code: string; name: string };
  /** What each NJ Transit feed said about this bus (the stats sheet; only asked for while it's open). */
  debug?: BusDebug;
}

export interface BusDebug {
  /** busdv: NJ Transit's own app tracks it; gps: only GTFS-realtime does; timetable: nobody. */
  source: 'busdv' | 'gps' | 'timetable';
  busdv: { status: string; at: number; live: boolean; vehicle: string | null } | null;
  /** GTFS-realtime trip-updates time at the boarding stop. */
  predicted: number | null;
  gps: { vehicle: string | null; at: number; meters: number | null } | null;
}

export interface Departures {
  from: Stop;
  to: Stop;
  now: number;
  liveOk: boolean;
  buses: Bus[];
  debug?: { busdvStops: string[]; realtimeAt: number | null; realtimeError: string | null; gpsBuses: number };
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body as T;
}

export const searchStops = (q: string, signal?: AbortSignal) =>
  get<{ stops: Stop[] }>(`/stops?q=${encodeURIComponent(q)}`, signal).then((r) => r.stops);

export const nearestStops = (lat: number, lon: number, signal?: AbortSignal) =>
  get<{ stops: Stop[] }>(`/stops?lat=${lat}&lon=${lon}`, signal).then((r) => r.stops);

/** `debug` adds the stats-sheet fields; normal polls leave them out to stay small. */
export const departures = (from: string, to: string, signal?: AbortSignal, debug = false) =>
  get<Departures>(`/departures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${debug ? '&debug=1' : ''}`, signal);
