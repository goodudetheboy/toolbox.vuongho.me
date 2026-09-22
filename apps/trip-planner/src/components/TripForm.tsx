import { useState, type FormEvent } from 'react';
import { toIsoDate } from '../lib/dates';
import type { Trip } from '../types';

interface TripFormProps {
  initialTrip?: Trip;
  onSubmit: (destination: string, startDate: string, endDate: string) => void;
  onCancel: () => void;
}

export default function TripForm({ initialTrip, onSubmit, onCancel }: TripFormProps) {
  const today = toIsoDate(new Date());
  const [destination, setDestination] = useState(initialTrip?.destination ?? '');
  const [startDate, setStartDate] = useState(initialTrip?.startDate ?? today);
  const [endDate, setEndDate] = useState(initialTrip?.endDate ?? today);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!destination.trim()) {
      setError('Enter a destination.');
      return;
    }
    if (endDate < startDate) {
      setError('The end date must be on or after the start date.');
      return;
    }
    setError(null);
    onSubmit(destination.trim(), startDate, endDate);
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h2>{initialTrip ? 'Edit trip' : 'New trip'}</h2>
      <label className="field">
        <span>Destination</span>
        <input
          type="text"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Kyoto, Japan"
          autoFocus
        />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Start date</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="field">
          <span>End date</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          {initialTrip ? 'Save changes' : 'Create trip'}
        </button>
      </div>
    </form>
  );
}
