import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheerSlots } from './cheer';

test('cheerSlots: spaced out, inside the list, stable as the list grows', () => {
  for (let seed = 1; seed < 200; seed++) {
    const short = cheerSlots(seed, 12, false);
    const long = cheerSlots(seed, 40, false);
    for (const s of long) assert.ok(s.after >= 1 && s.after < 39);
    long.slice(1).forEach((s, k) => assert.ok(s.after - long[k].after >= 5));
    // every note on the short sheet keeps its place and message on the longer one
    assert.deepEqual(short, long.slice(0, short.length));
    assert.ok(long.every((s) => !s.vpork));
  }
  assert.deepEqual(cheerSlots(5, 2, true), []);
});

test('cheerSlots: Vpork is rare, only where allowed, and only the first note', () => {
  let hits = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const slots = cheerSlots(seed, 30, true);
    if (slots[0]?.vpork) hits++;
    assert.ok(slots.slice(1).every((s) => !s.vpork));
  }
  assert.ok(hits > 100 && hits < 320, `vpork in ${hits} of 2000`);
});
