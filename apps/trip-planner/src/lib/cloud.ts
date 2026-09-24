import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Activity, Trip } from '../types';
import { db } from './firebase';

const tripsCol = collection(db, 'trips');

function activitiesCol(tripId: string) {
  return collection(db, 'trips', tripId, 'activities');
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** Moves a local-only trip to Firestore: the current user becomes its owner. Same id, additive. */
export async function goOnline(trip: Trip, ownerUid: string): Promise<Trip> {
  const now = new Date().toISOString();
  const cloud: Trip['cloud'] = { ownerUid, editors: [], isShared: false, editToken: randomToken() };

  await setDoc(doc(tripsCol, trip.id), {
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    createdAt: trip.createdAt,
    updatedAt: now,
    ownerUid: cloud.ownerUid,
    editors: cloud.editors,
    isShared: cloud.isShared,
    editToken: cloud.editToken,
  });

  await Promise.all(
    trip.activities.map((activity) =>
      setDoc(doc(activitiesCol(trip.id), activity.id), activityToDoc(activity)),
    ),
  );

  return { ...trip, updatedAt: now, cloud };
}

function activityToDoc(activity: Activity) {
  const { id, ...rest } = activity;
  void id;
  return rest;
}

function docToActivity(id: string, data: Record<string, unknown>): Activity {
  return {
    id,
    date: data.date as string,
    startTime: data.startTime as string,
    endTime: data.endTime as string,
    title: data.title as string,
    description: data.description as string,
    category: data.category as Activity['category'],
    tags: (data.tags as string[]) ?? [],
  };
}

/** Live-subscribes to one cloud trip (doc + activities subcollection). `cb(null)` if it doesn't exist or isn't visible. */
export function subscribeTrip(tripId: string, cb: (trip: Trip | null) => void): Unsubscribe {
  let tripData: Record<string, unknown> | null = null;
  let activities: Activity[] = [];
  let haveTripDoc = false;
  let haveActivities = false;

  function emit() {
    if (!haveTripDoc || !haveActivities) return;
    if (!tripData) {
      cb(null);
      return;
    }
    cb({
      id: tripId,
      destination: tripData.destination as string,
      startDate: tripData.startDate as string,
      endDate: tripData.endDate as string,
      createdAt: tripData.createdAt as string,
      updatedAt: tripData.updatedAt as string,
      activities,
      cloud: {
        ownerUid: tripData.ownerUid as string,
        editors: (tripData.editors as string[]) ?? [],
        isShared: Boolean(tripData.isShared),
        editToken: tripData.editToken as string,
      },
    });
  }

  const unsubTrip = onSnapshot(
    doc(tripsCol, tripId),
    (snap) => {
      tripData = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      haveTripDoc = true;
      emit();
    },
    () => {
      tripData = null;
      haveTripDoc = true;
      emit();
    },
  );

  const unsubActivities = onSnapshot(
    activitiesCol(tripId),
    (snap) => {
      activities = snap.docs.map((d) => docToActivity(d.id, d.data()));
      haveActivities = true;
      emit();
    },
    () => {
      activities = [];
      haveActivities = true;
      emit();
    },
  );

  return () => {
    unsubTrip();
    unsubActivities();
  };
}

/** Live-subscribes to every cloud trip `uid` owns or has joined as an editor. */
export function subscribeMyTrips(uid: string, cb: (trips: Trip[]) => void): Unsubscribe {
  const byId = new Map<string, Trip>();
  const unsubs: Unsubscribe[] = [];
  const perTripUnsub = new Map<string, Unsubscribe>();

  function reconcile(ids: string[]) {
    for (const id of Array.from(perTripUnsub.keys())) {
      if (!ids.includes(id)) {
        perTripUnsub.get(id)?.();
        perTripUnsub.delete(id);
        byId.delete(id);
      }
    }
    for (const id of ids) {
      if (perTripUnsub.has(id)) continue;
      perTripUnsub.set(
        id,
        subscribeTrip(id, (trip) => {
          if (trip) byId.set(id, trip);
          else byId.delete(id);
          cb([...byId.values()]);
        }),
      );
    }
    cb([...byId.values()]);
  }

  let ownedIds: string[] = [];
  let editingIds: string[] = [];

  unsubs.push(
    onSnapshot(query(tripsCol, where('ownerUid', '==', uid)), (snap) => {
      ownedIds = snap.docs.map((d) => d.id);
      reconcile([...new Set([...ownedIds, ...editingIds])]);
    }),
  );
  unsubs.push(
    onSnapshot(query(tripsCol, where('editors', 'array-contains', uid)), (snap) => {
      editingIds = snap.docs.map((d) => d.id);
      reconcile([...new Set([...ownedIds, ...editingIds])]);
    }),
  );

  return () => {
    unsubs.forEach((u) => u());
    perTripUnsub.forEach((u) => u());
  };
}

export async function updateCloudTripDetails(
  tripId: string,
  destination: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  await updateDoc(doc(tripsCol, tripId), {
    destination,
    startDate,
    endDate,
    updatedAt: new Date().toISOString(),
  });
}

export async function upsertCloudActivity(tripId: string, activity: Activity): Promise<void> {
  await setDoc(doc(activitiesCol(tripId), activity.id), activityToDoc(activity));
  await updateDoc(doc(tripsCol, tripId), { updatedAt: new Date().toISOString() });
}

export async function deleteCloudActivity(tripId: string, activityId: string): Promise<void> {
  await deleteDoc(doc(activitiesCol(tripId), activityId));
  await updateDoc(doc(tripsCol, tripId), { updatedAt: new Date().toISOString() });
}

export async function deleteCloudTrip(tripId: string, activityIds: string[]): Promise<void> {
  await Promise.all(activityIds.map((id) => deleteDoc(doc(activitiesCol(tripId), id))));
  await deleteDoc(doc(tripsCol, tripId));
}

export async function setTripShared(tripId: string, isShared: boolean): Promise<void> {
  await updateDoc(doc(tripsCol, tripId), { isShared });
}

export async function regenerateEditToken(tripId: string): Promise<string> {
  const editToken = randomToken();
  await updateDoc(doc(tripsCol, tripId), { editToken });
  return editToken;
}

/** Fetches one trip by id for the pre-sign-in "is this even a valid share link" check. Null if not visible. */
export async function peekTrip(tripId: string): Promise<{ destination: string } | null> {
  const snap = await getDoc(doc(tripsCol, tripId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { destination: data.destination as string };
}

/**
 * Adds `uid` to a shared trip's editors via its edit link. Verified server-side by a transaction
 * (not a client trust check): the trip must be shared and `editToken` must match.
 */
export async function joinAsEditor(tripId: string, editToken: string, uid: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(tripsCol, tripId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('That trip no longer exists.');
    const data = snap.data();
    if (!data.isShared) throw new Error('This trip is not shared.');
    if (data.editToken !== editToken) throw new Error('That edit link is no longer valid.');
    if (data.ownerUid === uid || (data.editors as string[])?.includes(uid)) return;
    tx.update(ref, { editors: arrayUnion(uid) });
  });
}
