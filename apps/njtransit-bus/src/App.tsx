import { useEffect, useState } from 'react';
import { loadTrip, saveTrip, type Trip } from './lib/saved';
import Setup from './screens/Setup';
import Board from './screens/Board';

// Two screens, no routing: pick the stops, then the board. With stops saved,
// the app opens straight on the board.
export default function App() {
  const [trip, setTrip] = useState<Trip | null>(loadTrip);
  const [editing, setEditing] = useState(trip === null);

  useEffect(() => {
    if (trip) saveTrip(trip);
  }, [trip]);

  // Keep the page behind the app (overscroll, notch) the same color as the screen.
  const back = !editing && trip?.back;
  useEffect(() => {
    const color = back ? '#003da5' : '#ffffff';
    document.documentElement.style.setProperty('--page-bg', color);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [back]);

  if (editing || !trip) {
    return (
      <Setup
        initial={trip}
        onGo={(t) => {
          setTrip(t);
          setEditing(false);
        }}
      />
    );
  }
  return <Board trip={trip} onEdit={() => setEditing(true)} onFlip={() => setTrip({ ...trip, back: !trip.back })} />;
}
