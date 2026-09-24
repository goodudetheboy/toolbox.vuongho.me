import { useEffect, useState } from 'react';
import AuthBar from './components/AuthBar';
import ItineraryView from './components/ItineraryView';
import TripForm from './components/TripForm';
import TripList from './components/TripList';
import { completeEmailLinkSignInIfPresent, useAuth } from './lib/auth';
import { joinAsEditor, subscribeTrip } from './lib/cloud';
import { downloadTripsAsJson, readTripsFromFile } from './lib/exportImport';
import { useTrips } from './lib/useTrips';
import type { Trip } from './types';

type View = { name: 'list' } | { name: 'create' } | { name: 'trip'; tripId: string };

function readUrlParams(): { tripId: string | null; editToken: string | null } {
  const params = new URLSearchParams(window.location.search);
  return { tripId: params.get('trip'), editToken: params.get('edit') };
}

/** Subscribes to a trip by id regardless of whether the viewer owns it — for view/edit share links. */
function useSharedTrip(tripId: string | null): Trip | null | undefined {
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);

  useEffect(() => {
    if (!tripId) {
      setTrip(undefined);
      return;
    }
    setTrip(undefined);
    return subscribeTrip(tripId, setTrip);
  }, [tripId]);

  return trip;
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const [urlParams] = useState(readUrlParams);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedToken, setJoinedToken] = useState<string | null>(null);

  const [view, setView] = useState<View>(
    urlParams.tripId ? { name: 'trip', tripId: urlParams.tripId } : { name: 'list' },
  );

  const {
    trips,
    createTrip,
    updateTripDetails,
    deleteTrip,
    upsertActivity,
    deleteActivity,
    importTrips,
    goOnline,
  } = useTrips(user);

  const sharedTrip = useSharedTrip(urlParams.tripId);

  useEffect(() => {
    void completeEmailLinkSignInIfPresent();
  }, []);

  // Join as editor once signed in, if this page was opened from an edit link.
  useEffect(() => {
    if (!urlParams.tripId || !urlParams.editToken || !user) return;
    if (joinedToken === urlParams.editToken) return;
    joinAsEditor(urlParams.tripId, urlParams.editToken, user.uid)
      .then(() => {
        setJoinedToken(urlParams.editToken);
        const url = new URL(window.location.href);
        url.searchParams.delete('edit');
        window.history.replaceState({}, '', url.toString());
      })
      .catch((err) => setJoinError(err instanceof Error ? err.message : 'Could not join as an editor.'));
  }, [urlParams.tripId, urlParams.editToken, user, joinedToken]);

  async function handleImportFile(file: File) {
    try {
      const imported = await readTripsFromFile(file);
      importTrips(imported);
      alert(`Imported ${imported.length} ${imported.length === 1 ? 'trip' : 'trips'}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import that file.');
    }
  }

  const activeTrip =
    view.name === 'trip'
      ? trips.find((t) => t.id === view.tripId) ??
        (view.tripId === urlParams.tripId ? sharedTrip : undefined)
      : undefined;

  const isOwner = Boolean(activeTrip?.cloud && user && activeTrip.cloud.ownerUid === user.uid);
  const canEdit =
    Boolean(activeTrip) &&
    (!activeTrip?.cloud ||
      Boolean(
        user && (user.uid === activeTrip.cloud.ownerUid || activeTrip.cloud.editors.includes(user.uid)),
      ));

  return (
    <main className="page">
      <div className="page-header">
        <div className="header-top">
          <a className="back-link" href="/">
            ← Back to Toolbox
          </a>
          <AuthBar user={user} loading={authLoading} />
        </div>
        <h1>Trip Planner</h1>
        <p className="subtitle">
          A simple itinerary keeper. Local by default — sign in to sync a trip and share it.
        </p>
      </div>

      {joinError && <p className="error">{joinError}</p>}

      {view.name === 'list' && (
        <TripList
          trips={trips}
          currentUid={user?.uid ?? null}
          onOpen={(tripId) => setView({ name: 'trip', tripId })}
          onDelete={deleteTrip}
          onCreate={() => setView({ name: 'create' })}
          onExportAll={() => downloadTripsAsJson(trips)}
          onImportFile={handleImportFile}
        />
      )}

      {view.name === 'create' && (
        <TripForm
          onSubmit={(destination, startDate, endDate) => {
            const trip = createTrip(destination, startDate, endDate);
            setView({ name: 'trip', tripId: trip.id });
          }}
          onCancel={() => setView({ name: 'list' })}
        />
      )}

      {view.name === 'trip' && activeTrip && (
        <ItineraryView
          trip={activeTrip}
          readOnly={!canEdit}
          isOwner={isOwner}
          onGoOnline={
            !activeTrip.cloud && user
              ? () => {
                  void goOnline(activeTrip.id);
                }
              : undefined
          }
          onBack={() => setView({ name: 'list' })}
          onUpdateTripDetails={(destination, startDate, endDate) =>
            updateTripDetails(activeTrip.id, destination, startDate, endDate)
          }
          onUpsertActivity={(activity) => upsertActivity(activeTrip.id, activity)}
          onDeleteActivity={(activityId) => deleteActivity(activeTrip.id, activityId)}
        />
      )}

      {view.name === 'trip' && !activeTrip && activeTrip !== undefined && (
        <p className="empty">
          That trip was not found, or isn't shared.{' '}
          <button onClick={() => setView({ name: 'list' })}>Go back</button>
        </p>
      )}
    </main>
  );
}
