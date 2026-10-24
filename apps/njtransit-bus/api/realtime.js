// GTFS-realtime (GTFSG2): trip updates (getTripUpdates), NJ Transit's predicted
// time at every stop of every trip running now or soon, and vehicle positions
// (getVehiclePositions), which trip each bus on the road is driving. Each is
// one protobuf file for the whole system. BUSDV2 leaves out buses that are on
// the road (at Boulevard East at 62nd it skipped three late ones a few hundred
// meters away), so these fill in the ones it skips. Trip ids are the timetable's.
//
// Only the few fields needed are decoded, by hand, so no protobuf library:
// FeedMessage.entity(2) → FeedEntity.trip_update(3) → TripUpdate.trip(1).trip_id(1)
// and TripUpdate.stop_time_update(2) → stop_id(4), arrival(2)/departure(3) → time(2);
// FeedEntity.vehicle(4) → VehiclePosition.trip(1).trip_id(1), timestamp(5).

function reader(buf, start = 0, end = buf.length) {
  let i = start;
  // Varints can be 64-bit (negative delays); plain Number math keeps times exact.
  const varint = () => {
    let r = 0;
    let mul = 1;
    for (;;) {
      if (i >= end) throw new Error('protobuf: truncated');
      const b = buf[i++];
      r += (b & 0x7f) * mul;
      if (b < 0x80) return r;
      mul *= 128;
    }
  };
  return {
    // Calls onField(field, wireType, value) where value is a number (varint)
    // or [start, end] (length-delimited); other wire types are skipped.
    each(onField) {
      while (i < end) {
        const key = varint();
        const field = Math.floor(key / 8);
        const wire = key & 7;
        if (wire === 0) onField(field, wire, varint());
        else if (wire === 2) {
          const n = varint();
          onField(field, wire, [i, i + n]);
          i += n;
        } else if (wire === 1) i += 8;
        else if (wire === 5) i += 4;
        else throw new Error(`protobuf: wire type ${wire}`);
      }
    },
  };
}

const str = (buf, [a, b]) => new TextDecoder().decode(buf.subarray(a, b));

function eventTime(buf, span) {
  let t = null;
  reader(buf, ...span).each((f, w, v) => {
    if (f === 2 && w === 0) t = v * 1000;
  });
  return t;
}

// protobuf bytes → Map(trip id → Map(stop_id → epoch ms it leaves)), or
// trip id → null for a cancelled trip.
export function parseTripUpdates(buf) {
  const out = new Map();
  reader(buf).each((f, w, entity) => {
    if (f !== 2 || w !== 2) return;
    reader(buf, ...entity).each((f, w, tu) => {
      if (f !== 3 || w !== 2) return;
      let trip = null;
      let canceled = false;
      const stops = new Map();
      reader(buf, ...tu).each((f, w, v) => {
        if (f === 1 && w === 2) {
          reader(buf, ...v).each((f, w, x) => {
            if (f === 1 && w === 2) trip = str(buf, x);
            if (f === 4 && w === 0 && x === 3) canceled = true; // CANCELED
          });
        } else if (f === 2 && w === 2) {
          let stop = null;
          let arr = null;
          let dep = null;
          let skipped = false;
          reader(buf, ...v).each((f, w, x) => {
            if (f === 4 && w === 2) stop = str(buf, x);
            else if (f === 2 && w === 2) arr = eventTime(buf, x);
            else if (f === 3 && w === 2) dep = eventTime(buf, x);
            else if (f === 5 && w === 0 && x === 1) skipped = true; // SKIPPED
          });
          const at = dep ?? arr;
          if (stop && at && !skipped && !stops.has(stop)) stops.set(stop, at);
        }
      });
      if (trip && canceled) out.set(trip, null);
      else if (trip && stops.size) out.set(trip, stops);
    });
  });
  return out;
}

// protobuf bytes → Set of trip ids a bus reported its position on since `sinceMs`.
export function parseVehicleTrips(buf, sinceMs) {
  const out = new Set();
  reader(buf).each((f, w, entity) => {
    if (f !== 2 || w !== 2) return;
    reader(buf, ...entity).each((f, w, vp) => {
      if (f !== 4 || w !== 2) return;
      let trip = null;
      let at = 0;
      reader(buf, ...vp).each((f, w, v) => {
        if (f === 1 && w === 2) {
          reader(buf, ...v).each((f, w, x) => {
            if (f === 1 && w === 2) trip = str(buf, x);
          });
        } else if (f === 5 && w === 0) at = v * 1000;
      });
      if (trip && at >= sinceMs) out.add(trip);
    });
  });
  return out;
}
