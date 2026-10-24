import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveFirst } from './order.js';

const bus = (at, live) => ({ trip: `${at}${live ? 'L' : 'S'}`, at, live });

test('timetable buses only after the last tracked one', () => {
  const out = liveFirst([bus(30, false), bus(10, true), bus(20, false), bus(25, true), bus(40, false)]);
  assert.deepEqual(out.map((b) => b.trip), ['10L', '25L', '30S', '40S']);
});

test('no tracked buses: the whole timetable', () => {
  assert.deepEqual(liveFirst([bus(20, false), bus(10, false)]).map((b) => b.trip), ['10S', '20S']);
});

test('a timetable bus at the same time as the last tracked one is dropped', () => {
  assert.deepEqual(liveFirst([bus(10, true), bus(10, false), bus(11, false)]).map((b) => b.trip), ['10L', '11S']);
});
