import { useCallback, useEffect, useState } from 'react';
import type { Activity, Trip } from '../types';
import { loadTrips, saveTrips } from './storage';

export function useTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    setTrips(loadTrips());
  }, []);

  const createTrip = useCallback(
    (destination: string, startDate: string, endDate: string): Trip => {
      const now = new Date().toISOString();
      const trip: Trip = {
        id: crypto.randomUUID(),
        destination,
        startDate,
        endDate,
        activities: [],
        createdAt: now,
        updatedAt: now,
      };
      setTrips((prev) => {
        const next = [...prev, trip];
        saveTrips(next);
        return next;
      });
      return trip;
    },
    [],
  );

  const updateTripDetails = useCallback(
    (tripId: string, destination: string, startDate: string, endDate: string) => {
      setTrips((prev) => {
        const next = prev.map((trip) =>
          trip.id === tripId
            ? { ...trip, destination, startDate, endDate, updatedAt: new Date().toISOString() }
            : trip,
        );
        saveTrips(next);
        return next;
      });
    },
    [],
  );

  const deleteTrip = useCallback((tripId: string) => {
    setTrips((prev) => {
      const next = prev.filter((trip) => trip.id !== tripId);
      saveTrips(next);
      return next;
    });
  }, []);

  const upsertActivity = useCallback((tripId: string, activity: Activity) => {
    setTrips((prev) => {
      const next = prev.map((trip) => {
        if (trip.id !== tripId) return trip;
        const exists = trip.activities.some((a) => a.id === activity.id);
        const activities = exists
          ? trip.activities.map((a) => (a.id === activity.id ? activity : a))
          : [...trip.activities, activity];
        return { ...trip, activities, updatedAt: new Date().toISOString() };
      });
      saveTrips(next);
      return next;
    });
  }, []);

  const deleteActivity = useCallback((tripId: string, activityId: string) => {
    setTrips((prev) => {
      const next = prev.map((trip) =>
        trip.id === tripId
          ? {
              ...trip,
              activities: trip.activities.filter((a) => a.id !== activityId),
              updatedAt: new Date().toISOString(),
            }
          : trip,
      );
      saveTrips(next);
      return next;
    });
  }, []);

  return { trips, createTrip, updateTripDetails, deleteTrip, upsertActivity, deleteActivity };
}
