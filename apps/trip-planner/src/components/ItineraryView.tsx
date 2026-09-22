import { useMemo, useState } from 'react';
import { enumerateDates, formatDateLong, formatDateRange } from '../lib/dates';
import type { Activity, Trip } from '../types';
import ActivityCard from './ActivityCard';
import ActivityForm from './ActivityForm';
import TripForm from './TripForm';

interface ItineraryViewProps {
  trip: Trip;
  onBack: () => void;
  onUpdateTripDetails: (destination: string, startDate: string, endDate: string) => void;
  onUpsertActivity: (activity: Activity) => void;
  onDeleteActivity: (activityId: string) => void;
}

export default function ItineraryView({
  trip,
  onBack,
  onUpdateTripDetails,
  onUpsertActivity,
  onDeleteActivity,
}: ItineraryViewProps) {
  const [editingTrip, setEditingTrip] = useState(false);
  const [activityFormFor, setActivityFormFor] = useState<{
    date: string;
    activity?: Activity;
  } | null>(null);

  const days = useMemo(
    () => enumerateDates(trip.startDate, trip.endDate),
    [trip.startDate, trip.endDate],
  );

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of trip.activities) {
      const list = map.get(activity.date) ?? [];
      list.push(activity);
      map.set(activity.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [trip.activities]);

  if (editingTrip) {
    return (
      <TripForm
        initialTrip={trip}
        onSubmit={(destination, startDate, endDate) => {
          onUpdateTripDetails(destination, startDate, endDate);
          setEditingTrip(false);
        }}
        onCancel={() => setEditingTrip(false)}
      />
    );
  }

  return (
    <div>
      <button className="link-button" onClick={onBack}>
        ← All trips
      </button>
      <div className="section-header">
        <div>
          <h2>{trip.destination}</h2>
          <p className="trip-dates-subtitle">{formatDateRange(trip.startDate, trip.endDate)}</p>
        </div>
        <button className="secondary" onClick={() => setEditingTrip(true)}>
          Edit trip / dates
        </button>
      </div>

      {days.length === 0 && <p className="empty">This trip has no dates yet.</p>}

      {days.map((day) => (
        <section key={day} className="day-section">
          <div className="day-header">
            <h3>{formatDateLong(day)}</h3>
            <button
              className="secondary small"
              onClick={() => setActivityFormFor({ date: day })}
            >
              + Add activity
            </button>
          </div>
          {activityFormFor?.date === day && (
            <ActivityForm
              tripDates={days}
              defaultDate={day}
              initialActivity={activityFormFor.activity}
              onSubmit={(activity) => {
                onUpsertActivity(activity);
                setActivityFormFor(null);
              }}
              onCancel={() => setActivityFormFor(null)}
            />
          )}
          <ul className="activity-list">
            {(activitiesByDate.get(day) ?? []).map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                onEdit={() => setActivityFormFor({ date: day, activity })}
                onDelete={() => onDeleteActivity(activity.id)}
              />
            ))}
          </ul>
          {(activitiesByDate.get(day) ?? []).length === 0 && activityFormFor?.date !== day && (
            <p className="empty small">No activities planned yet.</p>
          )}
        </section>
      ))}
    </div>
  );
}
