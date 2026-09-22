export type ActivityCategory = 'sightseeing' | 'dining';

export const ACTIVITY_CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: 'sightseeing', label: 'Sightseeing' },
  { value: 'dining', label: 'Dining' },
];

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
}

export interface Trip {
  id: string;
  destination: string;
  /** ISO date (YYYY-MM-DD), inclusive */
  startDate: string;
  /** ISO date (YYYY-MM-DD), inclusive */
  endDate: string;
  activities: Activity[];
  createdAt: string;
  updatedAt: string;
}
