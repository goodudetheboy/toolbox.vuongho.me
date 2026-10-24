// The two stops and which way you're going, kept on this device only.

import type { Stop } from './api';

export type SavedStop = Pick<Stop, 'code' | 'name' | 'routes' | 'headsigns'>;

export interface Trip {
  home: SavedStop;
  dest: SavedStop;
  /** true = heading back, from `dest` to `home`. */
  back: boolean;
}

const KEY = 'njtransit-bus:trip';

export function loadTrip(): Trip | null {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || 'null');
    return t?.home?.code && t?.dest?.code ? { home: t.home, dest: t.dest, back: Boolean(t.back) } : null;
  } catch {
    return null;
  }
}

export function saveTrip(trip: Trip) {
  try {
    localStorage.setItem(KEY, JSON.stringify(trip));
  } catch {
    // Private mode: the trip just won't be remembered.
  }
}

export const toSaved = ({ code, name, routes, headsigns }: Stop | SavedStop): SavedStop => ({
  code,
  name,
  routes,
  headsigns,
});
