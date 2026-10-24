import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTripUpdates, parseVehicleTrips } from './realtime.js';

// A tiny protobuf writer, just enough to build a feed.
const varint = (n) => {
  const out = [];
  while (n >= 128) {
    out.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return out;
};
const num = (field, n) => [...varint(field * 8), ...varint(n)];
const bytes = (field, b) => [...varint(field * 8 + 2), ...varint(b.length), ...b];
const str = (field, s) => bytes(field, [...new TextEncoder().encode(s)]);

const stu = (stop, depSec, extra = []) => bytes(2, [...str(4, stop), ...bytes(3, [...num(1, 2 ** 64 - 6), ...num(2, depSec)]), ...extra]);
const entity = (trip, updates, rel = 0) => bytes(2, [...str(1, 'e'), ...bytes(3, [...bytes(1, [...str(1, trip), ...num(4, rel)]), ...updates.flat()])]);
const feed = (...entities) => new Uint8Array([...bytes(1, [...str(1, '2.0')]), ...entities.flat()]);

test('stop times by trip, negative delays and skipped stops handled', () => {
  const out = parseTripUpdates(
    feed(entity('100', [stu('21892', 1792881049), stu('26229-200_1', 1792882000, num(5, 1)), stu('26229', 1792882100)])),
  );
  assert.deepEqual([...out.get('100')], [
    ['21892', 1792881049000],
    ['26229', 1792882100000],
  ]);
});

test('a cancelled trip is null', () => {
  const out = parseTripUpdates(feed(entity('7', [stu('1', 1)], 3), entity('8', [stu('1', 2)])));
  assert.equal(out.get('7'), null);
  assert.equal(out.get('8').get('1'), 2000);
});

test('trips a bus reported on recently', () => {
  const vehicle = (trip, ts) => bytes(2, [...str(1, 'v'), ...bytes(4, [...bytes(1, [...str(1, trip)]), ...num(5, ts)])]);
  const out = parseVehicleTrips(feed(vehicle('1', 1000), vehicle('2', 800)), 900 * 1000);
  assert.deepEqual([...out], ['1']);
});
