import type { Trip } from '../types';

const STORAGE_KEY = 'trip-planner:trips';

export function loadTrips(): Trip[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTrips(trips: Trip[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}
