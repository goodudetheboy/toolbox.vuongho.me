import { useState, type FormEvent } from 'react';
import { ACTIVITY_CATEGORIES } from '../types';
import type { Activity, ActivityCategory } from '../types';

interface ActivityFormProps {
  tripDates: string[];
  defaultDate: string;
  initialActivity?: Activity;
  onSubmit: (activity: Activity) => void;
  onCancel: () => void;
}

export default function ActivityForm({
  tripDates,
  defaultDate,
  initialActivity,
  onSubmit,
  onCancel,
}: ActivityFormProps) {
  const [date, setDate] = useState(initialActivity?.date ?? defaultDate);
  const [startTime, setStartTime] = useState(initialActivity?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(initialActivity?.endTime ?? '10:00');
  const [title, setTitle] = useState(initialActivity?.title ?? '');
  const [description, setDescription] = useState(initialActivity?.description ?? '');
  const [category, setCategory] = useState<ActivityCategory>(
    initialActivity?.category ?? 'sightseeing',
  );
  const [tagsText, setTagsText] = useState(initialActivity?.tags.join(', ') ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Enter a title.');
      return;
    }
    if (endTime < startTime) {
      setError('The end time must be on or after the start time.');
      return;
    }
    const tags = tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    setError(null);
    onSubmit({
      id: initialActivity?.id ?? crypto.randomUUID(),
      date,
      startTime,
      endTime,
      title: title.trim(),
      description: description.trim(),
      category,
      tags,
    });
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h3>{initialActivity ? 'Edit activity' : 'Add activity'}</h3>
      <label className="field">
        <span>Date</span>
        <select value={date} onChange={(e) => setDate(e.target.value)}>
          {tripDates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>Start time</span>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label className="field">
          <span>End time</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Fushimi Inari Shrine"
          autoFocus
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Optional notes"
        />
      </label>
      <label className="field">
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ActivityCategory)}>
          {ACTIVITY_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Tags</span>
        <input
          type="text"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="comma, separated, tags"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          {initialActivity ? 'Save changes' : 'Add activity'}
        </button>
      </div>
    </form>
  );
}
