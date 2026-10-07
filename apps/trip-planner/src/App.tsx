import { useEffect, useState } from 'react';
import AuthBar from './components/AuthBar';
import ItineraryView from './components/ItineraryView';
import TripForm from './components/TripForm';
import TripList from './components/TripList';
import { completeEmailLinkSignInIfPresent, useAuth } from './lib/auth';
import { joinAsEditor, subscribeTrip } from './lib/cloud';
import { downloadTripsAsJson, readTripsFromFile } from './lib/exportImport';
import { useRoute } from './lib/router';
import { useTrips } from './lib/useTrips';
import type { Trip } from './types';

/** The edit-link token (`/trips/<id>?edit=<token>`), read once on load — see migrateLegacyTripQuery for old links. */
function readEditToken(): string | null {
  return new URLSearchParams(window.location.search).get('edit');
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
  const { route, navigate, goBack } = useRoute();
  // The trip an edit link points at, captured on load (the route may change before sign-in finishes).
  const [editLink] = useState(() => {
    const editToken = readEditToken();
    return editToken && route.name === 'trip' ? { tripId: route.tripId, editToken } : null;
  });
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedToken, setJoinedToken] = useState<string | null>(null);

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

  const routeTripId = route.name === 'trip' ? route.tripId : null;
  const ownTrip = routeTripId ? trips.find((t) => t.id === routeTripId) : undefined;
  // Trips that aren't in my own list (someone else's, opened from a share link) are subscribed to directly.
  const sharedTrip = useSharedTrip(routeTripId && !ownTrip ? routeTripId : null);

  useEffect(() => {
    void completeEmailLinkSignInIfPresent();
  }, []);

  // Join as editor once signed in, if this page was opened from an edit link.
  useEffect(() => {
    if (!editLink || !user) return;
    if (joinedToken === editLink.editToken) return;
    joinAsEditor(editLink.tripId, editLink.editToken, user.uid)
      .then(() => {
        setJoinedToken(editLink.editToken);
        const url = new URL(window.location.href);
        url.searchParams.delete('edit');
        window.history.replaceState({}, '', url.toString());
      })
      .catch((err) => setJoinError(err instanceof Error ? err.message : 'Could not join as an editor.'));
  }, [editLink, user, joinedToken]);

  async function handleImportFile(file: File) {
    try {
      const imported = await readTripsFromFile(file);
      importTrips(imported);
      alert(`Imported ${imported.length} ${imported.length === 1 ? 'trip' : 'trips'}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import that file.');
    }
  }

  const activeTrip = ownTrip ?? (routeTripId ? sharedTrip : undefined);

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
          A simple itinerary keeper. Local by default. Sign in to sync a trip and share it.
        </p>
      </div>

      {joinError && <p className="error">{joinError}</p>}

      {(route.name === 'list' || route.name === 'notFound') && (
        <TripList
          trips={trips}
          currentUid={user?.uid ?? null}
          onOpen={(tripId) => navigate({ name: 'trip', tripId, mode: 'view' })}
          onDelete={deleteTrip}
          onCreate={() => navigate({ name: 'create' })}
          onExportAll={() => downloadTripsAsJson(trips)}
          onImportFile={handleImportFile}
        />
      )}

      {route.name === 'create' && (
        <TripForm
          onSubmit={(destination, startDate, endDate, notes) => {
            const trip = createTrip(destination, startDate, endDate, notes);
            navigate({ name: 'trip', tripId: trip.id, mode: 'view' }, { replace: true });
          }}
          onCancel={() => goBack({ name: 'list' })}
        />
      )}

      {route.name === 'trip' && activeTrip && (
        <ItineraryView
          trip={activeTrip}
          readOnly={!canEdit}
          isOwner={isOwner}
          mode={route.mode}
          onChangeMode={(mode) => navigate({ name: 'trip', tripId: activeTrip.id, mode })}
          onCloseSubview={() => goBack({ name: 'trip', tripId: activeTrip.id, mode: 'view' })}
          onGoOnline={
            !activeTrip.cloud && user
              ? () => {
                  void goOnline(activeTrip.id);
                }
              : undefined
          }
          onBack={() => goBack({ name: 'list' })}
          onUpdateTripDetails={(destination, startDate, endDate, notes) =>
            updateTripDetails(activeTrip.id, destination, startDate, endDate, notes)
          }
          onUpsertActivity={(activity) => upsertActivity(activeTrip.id, activity)}
          onDeleteActivity={(activityId) => deleteActivity(activeTrip.id, activityId)}
        />
      )}

      {route.name === 'trip' && !activeTrip && activeTrip !== undefined && (
        <p className="empty">
          That trip was not found, or isn't shared.{' '}
          <button onClick={() => navigate({ name: 'list' }, { replace: true })}>Go back</button>
        </p>
      )}
    </main>
  );
}
