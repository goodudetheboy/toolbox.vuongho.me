import { useRef } from 'react';
import { formatDateRange } from '../lib/dates';
import type { Trip } from '../types';

interface TripListProps {
  trips: Trip[];
  onOpen: (tripId: string) => void;
  onDelete: (tripId: string) => void;
  onCreate: () => void;
  onExportAll: () => void;
  onImportFile: (file: File) => void;
}

export default function TripList({
  trips,
  onOpen,
  onDelete,
  onCreate,
  onExportAll,
  onImportFile,
}: TripListProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="section-header">
        <h2>Your trips</h2>
        <div className="header-actions">
          {trips.length > 0 && (
            <button className="secondary" onClick={onExportAll}>
              Export
            </button>
          )}
          <button className="secondary" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
              e.target.value = '';
            }}
          />
          <button className="primary" onClick={onCreate}>
            + New trip
          </button>
        </div>
      </div>
      <p className="hint">
        Your trips are saved only on this device. Use Export to back them up or move them to
        another device, and Import to bring a backup back in.
      </p>
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
