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

// Bookmarked trips: a pair of stops, either way round counts as the same trip,
// with an optional name ("WORK") shown above the stop names.
export type Bookmark = Pick<Trip, 'home' | 'dest'> & { title?: string };

const BOOKMARKS_KEY = 'njtransit-bus:bookmarks';

export function loadBookmarks(): Bookmark[] {
  try {
    const list = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((b) => b?.home?.code && b?.dest?.code) : [];
  } catch {
    return [];
  }
}

export function saveBookmarks(list: Bookmark[]) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
  } catch {
    // Private mode: bookmarks last until the page closes.
  }
}

export const sameTrip = (a: Pick<Trip, 'home' | 'dest'>, b: Pick<Trip, 'home' | 'dest'>) =>
  (a.home.code === b.home.code && a.dest.code === b.dest.code) ||
  (a.home.code === b.dest.code && a.dest.code === b.home.code);

export const toSaved = ({ code, name, routes, headsigns }: Stop | SavedStop): SavedStop => ({
  code,
  name,
  routes,
  headsigns,
});

// What the board's tiles show besides the time and route (the settings sheet).
export interface Settings {
  /** The bus's tracking number, e.g. TRACKING #6386. */
  busId: boolean;
  /** How full it is, as a row of people. */
  crowd: boolean;
}

const SETTINGS_KEY = 'njtransit-bus:settings';
const DEFAULT_SETTINGS: Settings = { busId: false, crowd: false };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Private mode: settings last until the page closes.
  }
}
