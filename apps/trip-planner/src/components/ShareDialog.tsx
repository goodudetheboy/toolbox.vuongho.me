import { useState } from 'react';
import { regenerateEditToken, setTripShared } from '../lib/cloud';
import type { Trip } from '../types';

interface ShareDialogProps {
  trip: Trip & { cloud: NonNullable<Trip['cloud']> };
  onClose: () => void;
}

function shareUrl(tripId: string, editToken?: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('trip', tripId);
  if (editToken) url.searchParams.set('edit', editToken);
  return url.toString();
}

export default function ShareDialog({ trip, onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState<'view' | 'edit' | null>(null);

  function copy(kind: 'view' | 'edit', text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="panel">
      <h3>Share "{trip.destination}"</h3>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={trip.cloud.isShared}
          onChange={(e) => setTripShared(trip.id, e.target.checked)}
        />
        Anyone with the view link can see this itinerary
      </label>

      {trip.cloud.isShared && (
        <>
          <div className="field">
            <label>View link (read-only, no sign-in needed)</label>
            <div className="share-link-row">
              <input readOnly value={shareUrl(trip.id)} onFocus={(e) => e.target.select()} />
              <button className="secondary small" onClick={() => copy('view', shareUrl(trip.id))}>
                {copied === 'view' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="field">
            <label>Edit link (recipient must sign in)</label>
            <div className="share-link-row">
              <input
                readOnly
                value={shareUrl(trip.id, trip.cloud.editToken)}
                onFocus={(e) => e.target.select()}
              />
              <button
                className="secondary small"
                onClick={() => copy('edit', shareUrl(trip.id, trip.cloud.editToken))}
              >
                {copied === 'edit' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              className="link-button"
              onClick={() => {
                if (confirm('Regenerate the edit link? The old one will stop working.')) {
                  void regenerateEditToken(trip.id);
                }
              }}
            >
              Regenerate edit link
            </button>
          </div>

          {trip.cloud.editors.length > 0 && (
            <p className="hint">{trip.cloud.editors.length} other editor(s) have joined.</p>
          )}
        </>
      )}

      <div className="actions">
        <button className="secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
