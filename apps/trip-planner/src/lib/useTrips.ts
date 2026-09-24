import type { User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';
import type { Activity, Trip } from '../types';
import * as cloud from './cloud';
import { loadTrips, saveTrips } from './storage';

export function useTrips(user: User | null) {
  const [localTrips, setLocalTrips] = useState<Trip[]>([]);
  const [cloudTrips, setCloudTrips] = useState<Trip[]>([]);

  useEffect(() => {
    setLocalTrips(loadTrips());
  }, []);

  useEffect(() => {
    if (!user) {
      setCloudTrips([]);
      return;
    }
    return cloud.subscribeMyTrips(user.uid, setCloudTrips);
  }, [user]);

  const trips = [...localTrips, ...cloudTrips];
  const findTrip = useCallback(
    (tripId: string) => trips.find((t) => t.id === tripId),
    [trips],
  );

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
      setLocalTrips((prev) => {
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
      const trip = findTrip(tripId);
      if (trip?.cloud) {
        void cloud.updateCloudTripDetails(tripId, destination, startDate, endDate);
        return;
      }
      setLocalTrips((prev) => {
        const next = prev.map((t) =>
          t.id === tripId
            ? { ...t, destination, startDate, endDate, updatedAt: new Date().toISOString() }
            : t,
        );
        saveTrips(next);
        return next;
      });
    },
    [findTrip],
  );

  const deleteTrip = useCallback(
    (tripId: string) => {
      const trip = findTrip(tripId);
      if (trip?.cloud) {
        void cloud.deleteCloudTrip(tripId, trip.activities.map((a) => a.id));
        return;
      }
      setLocalTrips((prev) => {
        const next = prev.filter((t) => t.id !== tripId);
        saveTrips(next);
        return next;
      });
    },
    [findTrip],
  );

  const upsertActivity = useCallback(
    (tripId: string, activity: Activity) => {
      const trip = findTrip(tripId);
      if (trip?.cloud) {
        void cloud.upsertCloudActivity(tripId, activity);
        return;
      }
      setLocalTrips((prev) => {
        const next = prev.map((t) => {
          if (t.id !== tripId) return t;
          const exists = t.activities.some((a) => a.id === activity.id);
          const activities = exists
            ? t.activities.map((a) => (a.id === activity.id ? activity : a))
            : [...t.activities, activity];
          return { ...t, activities, updatedAt: new Date().toISOString() };
        });
        saveTrips(next);
        return next;
      });
    },
    [findTrip],
  );

  const deleteActivity = useCallback(
    (tripId: string, activityId: string) => {
      const trip = findTrip(tripId);
      if (trip?.cloud) {
        void cloud.deleteCloudActivity(tripId, activityId);
        return;
      }
      setLocalTrips((prev) => {
        const next = prev.map((t) =>
          t.id === tripId
            ? {
                ...t,
                activities: t.activities.filter((a) => a.id !== activityId),
                updatedAt: new Date().toISOString(),
              }
            : t,
        );
        saveTrips(next);
        return next;
      });
    },
    [findTrip],
  );

  const importTrips = useCallback((imported: Trip[]) => {
    setLocalTrips((prev) => {
      const byId = new Map(prev.map((trip) => [trip.id, trip]));
      // Imported trips always land as local-only, even if they were exported from a cloud trip —
      // importing shouldn't silently take over someone else's shared trip.
      for (const trip of imported) byId.set(trip.id, { ...trip, cloud: undefined });
      const next = [...byId.values()];
      saveTrips(next);
      return next;
    });
  }, []);

  /** Moves a local-only trip to Firestore, under the signed-in user, so it can be synced/shared. */
  const goOnline = useCallback(
    async (tripId: string) => {
      if (!user) throw new Error('Sign in first.');
      const trip = localTrips.find((t) => t.id === tripId);
      if (!trip) return;
      await cloud.goOnline(trip, user.uid);
      setLocalTrips((prev) => {
        const next = prev.filter((t) => t.id !== tripId);
        saveTrips(next);
        return next;
      });
    },
    [user, localTrips],
  );

  return {
    trips,
    findTrip,
    createTrip,
    updateTripDetails,
    deleteTrip,
    upsertActivity,
    deleteActivity,
    importTrips,
    goOnline,
  };
}
