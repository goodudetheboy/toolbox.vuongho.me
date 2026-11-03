import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAlerts, parseTripUpdates, parseVehicles } from './realtime.js';

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
  const vehicle = (trip, id, ts, occ = []) =>
    bytes(2, [
      ...str(1, 'v'),
      ...bytes(4, [...bytes(1, [...str(1, trip)]), ...bytes(2, [...f32(1, 40.5), ...f32(2, -74.25)]), ...num(5, ts), ...bytes(8, [...str(1, id)]), ...occ]),
    ]);
  const out = parseVehicles(
    feed(vehicle('1', '21308', 1000, num(9, 5)), vehicle('2', '22038', 800), vehicle('3', '7294', 1000, num(9, 7)), vehicle('4', '33', 1000, num(9, 2))),
    900 * 1000,
  );
  assert.deepEqual([...out], [
    ['1', { vehicle: '21308', lat: 40.5, lon: -74.25, at: 1000000, load: 'FULL' }],
    ['3', { vehicle: '7294', lat: 40.5, lon: -74.25, at: 1000000, load: null }],
    ['4', { vehicle: '33', lat: 40.5, lon: -74.25, at: 1000000, load: 'HALF_EMPTY' }],
  ]);
});

test('alerts with their routes, stops and words, repeats once', () => {
  const text = (field, s) => bytes(field, bytes(1, str(1, s)));
  const alert = (id, informed, desc) =>
    bytes(2, [...str(1, id), ...bytes(5, [...bytes(1, [...num(1, 100), ...num(2, 200)]), ...informed.flat(), ...text(10, 'H'), ...text(11, desc)])]);
  const out = parseAlerts(
    feed(
      alert('56514', [bytes(5, str(2, '165'))], 'Bus route 165 will not operate.'),
      alert('56514', [bytes(5, str(2, '165'))], 'Bus route 165 will not operate.'),
      alert('HACK', [bytes(5, [...str(1, 'NJB'), ...str(5, '12129-..')]), bytes(5, str(5, '12129-2'))], 'Have a nice day'),
    ),
  );
  assert.deepEqual(out, [
    { id: '56514', routes: new Set(['165']), stops: new Set(), agency: false, header: 'H', text: 'Bus route 165 will not operate.', start: 100000, end: 200000 },
    { id: 'HACK', routes: new Set(), stops: new Set(['12129']), agency: true, header: 'H', text: 'Have a nice day', start: 100000, end: 200000 },
  ]);
});
