import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardAlerts, departureMinute } from './alerts.js';

test('the departure time an alert names', () => {
  assert.equal(departureMinute('Bus route 165, the 7:36 AM departure from Westwood to NY PABT, will not operate'), 456);
  assert.equal(departureMinute('Bus route #84, the 6:58 AM departure from North Bergen'), 418);
  assert.equal(departureMinute('the 12:05 PM departure'), 725);
  assert.equal(departureMinute('the 12:20 a.m. departure'), 20);
  assert.equal(departureMinute('the 11:10 PM departure'), 1390);
  assert.equal(departureMinute('Route 166 is detoured until 7:00 PM'), null);
});

const H = 3600 * 1000;
const alert = (id, routes, text, stops = []) => ({ id, routes: new Set(routes), stops: new Set(stops), text, header: routes[0], start: 0, end: 30 * H });
const board = {
  now: 8 * H,
  lines: new Set(['166']),
  stops: new Set(['21892']),
  trips: [
    { trip: 'a', line: '165', startMinute: 7 * 60 + 36, scheduled: 8 * H + 10 * 60000 },
    { trip: 'b', line: '166', startMinute: 6 * 60 + 41, scheduled: 7 * H + 20 * 60000 },
    { trip: 'c', line: '166', startMinute: 7 * 60 + 50, scheduled: 9 * H },
  ],
};

test('a cancelled trip still to come counts (even with no bus of its route shown); one already gone or elsewhere does not', () => {
  const out = boardAlerts(
    [
      alert('1', ['166'], 'Bus route 166, the 7:50 AM departure from Cresskill to PABT, will not operate.'),
      alert('2', ['165'], 'Bus route 165, the 7:36 AM departure from Westwood to NY PABT, will not operate.'),
      alert('3', ['166'], 'Bus route 166, the 6:41 AM departure from Cresskill to PABT, did not operate.'),
      alert('4', ['165'], 'Bus route 165, the 7:12 AM departure from Hillsdale to NY PABT, will not operate.'),
      alert('5', ['25'], 'Bus route 25, the 6:53 AM departure from Irvington to Newark, will not operate.'),
    ],
    board,
  );
  assert.deepEqual(
    out.map((a) => [a.id, a.trips]),
    [
      ['2', ['a']],
      ['1', ['c']],
    ],
  );
});

test('alerts without a time count by route; stop alerts by stop; terminal greetings never', () => {
  const out = boardAlerts(
    [
      alert('6', ['166'], 'Route 166 is detoured off Boulevard East.'),
      alert('7', [], 'Stop closed for construction.', ['21892']),
      alert('HACK', [], 'Have a nice day', ['21892']),
      { ...alert('8', ['165'], 'Old news.'), end: 7 * H },
    ],
    board,
  );
  assert.deepEqual(
    out.map((a) => [a.id, a.routes]),
    [
      ['6', ['166']],
      ['7', []],
    ],
  );
});
