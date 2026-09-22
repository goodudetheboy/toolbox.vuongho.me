import { useState } from 'react';
import ItineraryView from './components/ItineraryView';
import TripForm from './components/TripForm';
import TripList from './components/TripList';
import { downloadTripsAsJson, readTripsFromFile } from './lib/exportImport';
import { useTrips } from './lib/useTrips';

type View = { name: 'list' } | { name: 'create' } | { name: 'trip'; tripId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'list' });
  const {
    trips,
    createTrip,
    updateTripDetails,
    deleteTrip,
    upsertActivity,
    deleteActivity,
    importTrips,
  } = useTrips();

  async function handleImportFile(file: File) {
    try {
      const imported = await readTripsFromFile(file);
      importTrips(imported);
      alert(`Imported ${imported.length} ${imported.length === 1 ? 'trip' : 'trips'}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not import that file.');
    }
  }

  const activeTrip = view.name === 'trip' ? trips.find((t) => t.id === view.tripId) : undefined;

  return (
    <main className="page">
      <div className="page-header">
        <a className="back-link" href="/">
          ← Back to Toolbox
        </a>
        <h1>Trip Planner</h1>
        <p className="subtitle">A simple itinerary keeper. Saved on this device.</p>
      </div>

      {view.name === 'list' && (
        <TripList
          trips={trips}
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
          onBack={() => setView({ name: 'list' })}
          onUpdateTripDetails={(destination, startDate, endDate) =>
            updateTripDetails(activeTrip.id, destination, startDate, endDate)
          }
          onUpsertActivity={(activity) => upsertActivity(activeTrip.id, activity)}
          onDeleteActivity={(activityId) => deleteActivity(activeTrip.id, activityId)}
        />
      )}

      {view.name === 'trip' && !activeTrip && (
        <p className="empty">
          That trip was not found. <button onClick={() => setView({ name: 'list' })}>Go back</button>
        </p>
      )}
    </main>
  );
}
