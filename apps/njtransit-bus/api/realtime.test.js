import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTripUpdates, parseVehicles } from './realtime.js';

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

test('buses that reported recently, with their trip and position', () => {
  const f32 = (field, x) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, x, true);
    return [...varint(field * 8 + 5), ...b];
  };
  const vehicle = (trip, id, ts) =>
    bytes(2, [
      ...str(1, 'v'),
      ...bytes(4, [...bytes(1, [...str(1, trip)]), ...bytes(2, [...f32(1, 40.5), ...f32(2, -74.25)]), ...num(5, ts), ...bytes(8, [...str(1, id)])]),
    ]);
  const out = parseVehicles(feed(vehicle('1', '21308', 1000), vehicle('2', '22038', 800)), 900 * 1000);
  assert.deepEqual([...out], [['1', { vehicle: '21308', lat: 40.5, lon: -74.25, at: 1000000 }]]);
});
