import type { Activity, ActivityCategory, Trip } from '../types';

const VALID_CATEGORIES: ActivityCategory[] = ['sightseeing', 'dining'];

function isActivity(value: unknown): value is Activity {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.date === 'string' &&
    typeof a.startTime === 'string' &&
    typeof a.endTime === 'string' &&
    typeof a.title === 'string' &&
    typeof a.description === 'string' &&
    VALID_CATEGORIES.includes(a.category as ActivityCategory) &&
    Array.isArray(a.tags) &&
    a.tags.every((tag) => typeof tag === 'string')
  );
}

function isTrip(value: unknown): value is Trip {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.destination === 'string' &&
    typeof t.startDate === 'string' &&
    typeof t.endDate === 'string' &&
    typeof t.createdAt === 'string' &&
    typeof t.updatedAt === 'string' &&
    Array.isArray(t.activities) &&
    t.activities.every(isActivity)
  );
}

/** Triggers a browser download of every trip as a single JSON file. */
export function downloadTripsAsJson(trips: Trip[]): void {
  const payload = { exportedAt: new Date().toISOString(), trips };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `trip-planner-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Parses a previously exported file back into trips. Throws with a user-facing message on bad input. */
export async function readTripsFromFile(file: File): Promise<Trip[]> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const candidateList = Array.isArray(parsed)
    ? parsed
    : (parsed as { trips?: unknown })?.trips;
  if (!Array.isArray(candidateList)) {
    throw new Error('That file does not look like a Trip Planner export.');
  }

  const trips = candidateList.filter(isTrip);
  if (trips.length === 0) {
    throw new Error('No valid trips were found in that file.');
  }
  return trips;
}
