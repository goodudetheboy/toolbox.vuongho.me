export type ActivityCategory = 'sightseeing' | 'dining';

export const ACTIVITY_CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: 'sightseeing', label: 'Sightseeing' },
  { value: 'dining', label: 'Dining' },
];

/** A Google Maps place attached to an activity (Places API (New) — see lib/places.ts). */
export interface ActivityPlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Opens the place in Google Maps. */
  mapsUrl: string;
}

export interface Activity {
  id: string;
  /** ISO date (YYYY-MM-DD) this activity falls on. Must be within the trip's date range. */
  date: string;
  /** 24h "HH:MM" */
  startTime: string;
  /** 24h "HH:MM" */
  endTime: string;
  title: string;
  description: string;
  category: ActivityCategory;
  tags: string[];
  /** Absent when no place was picked (and on activities from before places existed). */
  place?: ActivityPlace;
}

export interface Trip {
  id: string;
  destination: string;
  /** ISO date (YYYY-MM-DD), inclusive */
  startDate: string;
  /** ISO date (YYYY-MM-DD), inclusive */
  endDate: string;
  /** Free-text trip notes, shown under the title. Absent on trips created before notes existed. */
  notes?: string;
  activities: Activity[];
  createdAt: string;
  updatedAt: string;
  /** Present once this trip has been moved to Firestore (see lib/cloud.ts). Absent for local-only trips. */
  cloud?: {
    ownerUid: string;
    /** uids of signed-in users who joined via an edit link, in addition to the owner. */
    editors: string[];
    /** Whether the view link (`?trip=<id>`) grants read access to anyone, signed in or not. */
    isShared: boolean;
    /** Secret required (alongside sign-in) to join `editors` via the edit link. */
    editToken: string;
  };
}
