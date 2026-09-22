import { formatDateRange } from '../lib/dates';
import type { Trip } from '../types';

interface TripListProps {
  trips: Trip[];
  onOpen: (tripId: string) => void;
  onDelete: (tripId: string) => void;
  onCreate: () => void;
}

export default function TripList({ trips, onOpen, onDelete, onCreate }: TripListProps) {
  return (
    <div>
      <div className="section-header">
        <h2>Your trips</h2>
        <button className="primary" onClick={onCreate}>
          + New trip
        </button>
      </div>
      {trips.length === 0 && <p className="empty">No trips yet. Create one to get started.</p>}
      <ul className="trip-list">
        {trips.map((trip) => (
          <li key={trip.id} className="trip-card">
            <button className="trip-card-main" onClick={() => onOpen(trip.id)}>
              <span className="trip-destination">{trip.destination}</span>
              <span className="trip-dates">{formatDateRange(trip.startDate, trip.endDate)}</span>
              <span className="trip-activity-count">
                {trip.activities.length} {trip.activities.length === 1 ? 'activity' : 'activities'}
              </span>
            </button>
            <button
              className="icon-button"
              aria-label={`Delete ${trip.destination}`}
              onClick={() => {
                if (confirm(`Delete the trip to ${trip.destination}? This can't be undone.`)) {
                  onDelete(trip.id);
                }
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
