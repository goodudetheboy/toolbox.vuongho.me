import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { cleanHeadsign, loadGtfs } from './gtfs.js';
import { nyDate, nyTime, parseDvClock, parseDvDateTime, serviceDayStart } from './time.js';

const csv = (rows) => strToU8(rows.join('\n') + '\n');

// Home (A) and its across-the-street twin (A2, ~30 m away) on one route; the
// terminal (T) has gates. Route 1 runs A → T; route 1 back runs T → A2.
function fixture() {
  return zipSync({
    'stops.txt': csv([
      'stop_id,stop_code,stop_name,stop_lat,stop_lon,location_type,parent_station,platform_code',
      'A,100,MAIN ST AT 1ST AVE,40.0000,-74.0000,0,,',
      'A2,101,"MAIN ST AT 1ST AVE, FAR SIDE",40.00027,-74.0000,0,,',
      'M,200,MIDDLE RD,40.0100,-74.0000,0,,',
      'T-..,300,BIG TERMINAL,40.0200,-74.0000,0,STN-300,..',
      'T-201_1,300,BIG TERMINAL,40.0200,-74.0000,0,STN-300,201_1',
      'STN-300,STN-300,BIG TERMINAL,40.0200,-74.0000,1,,',
    ]),
    'routes.txt': csv(['route_id,agency_id,route_short_name,route_long_name,route_type', 'R1,NJB,1,Main,3']),
    'trips.txt': csv([
      'trip_id,route_id,service_id,trip_headsign,direction_id',
      '11,R1,WK,1 BIG TERMINAL,0',
      '12,R1,WK,1 BIG TERMINAL,0',
      '13,R1,WK,1 MAIN ST,1',
      '14,R1,SAT,1 BIG TERMINAL,0',
    ]),
    'stop_times.txt': csv([
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      '11,08:00:00,08:00:00,A,1',
      '11,08:10:00,08:10:00,M,2',
      '11,08:20:00,08:20:00,T-..,3',
      // Listed out of order on purpose; loading sorts by sequence.
      '12,24:40:00,24:40:00,T-..,3',
      '12,24:20:00,24:20:00,A,1',
      '12,24:30:00,24:30:00,M,2',
      '13,17:00:00,17:00:00,T-201_1,1',
      '13,17:20:00,17:20:00,A2,2',
      '14,09:00:00,09:00:00,A,1',
      '14,09:20:00,09:20:00,T-..,2',
    ]),
    'calendar.txt': csv([
      'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
      'WK,1,1,1,1,1,0,0,20261001,20261231',
      'SAT,0,0,0,0,0,1,0,20261001,20261231',
    ]),
    'calendar_dates.txt': csv(['service_id,date,exception_type', 'WK,20261028,2']),
  });
}

test('New York time conversions', () => {
  assert.equal(new Date(nyTime(2026, 10, 26, 8, 0)).toISOString(), '2026-10-26T12:00:00.000Z');
  assert.equal(new Date(nyTime(2026, 12, 1, 8, 0)).toISOString(), '2026-12-01T13:00:00.000Z');
  assert.equal(nyDate(Date.parse('2026-10-27T03:30:00Z')), '20261026');
  // DST ends 2026-11-01 (a 25-hour day): noon minus 12 h is 1 AM, not midnight.
  assert.equal(new Date(serviceDayStart('20261101')).toISOString(), '2026-11-01T05:00:00.000Z');
  assert.equal(new Date(parseDvDateTime('10/24/2026 09:20:37 AM')).toISOString(), '2026-10-24T13:20:37.000Z');
  assert.equal(new Date(parseDvDateTime('10/24/2026 12:05:00 AM')).toISOString(), '2026-10-24T04:05:00.000Z');
  const lateNight = nyTime(2026, 10, 24, 23, 58);
  assert.equal(new Date(parseDvClock('12:03 AM', lateNight)).toISOString(), '2026-10-25T04:03:00.000Z');
  assert.equal(new Date(parseDvClock('11:50 PM', lateNight)).toISOString(), '2026-10-25T03:50:00.000Z');
});

test('headsigns drop the leading route number', () => {
  assert.equal(cleanHeadsign('156 ENGLEWOOD CLIFFS VIA PARK AVE', '156'), 'ENGLEWOOD CLIFFS VIA PARK AVE');
  assert.equal(cleanHeadsign('159R NEW YORK', '159'), 'NEW YORK');
  assert.equal(cleanHeadsign('NEW YORK', '159'), 'NEW YORK');
});

test('stop search matches words in any order and abbreviations', () => {
  const g = loadGtfs(fixture());
  assert.deepEqual(g.searchStops('1st avenue main').map((s) => s.code), ['100']);
  assert.deepEqual(g.searchStops('300').map((s) => s.code), ['300']);
  assert.deepEqual(g.getStop('300').routes, ['1']);
  // The far side (101) is only ever a trip's last stop: nothing boards there, so it isn't offered.
  assert.deepEqual(g.searchStops('far side'), []);
  assert.equal(g.searchStops('middle').length, 1);
});

test('departures: right direction, service days, after-midnight times, gates', () => {
  const g = loadGtfs(fixture());
  const monday = nyTime(2026, 10, 26, 7, 0);
  const there = g.departures('100', '300', monday, monday + 24 * 3600 * 1000).departures;
  assert.deepEqual(
    there.map((d) => [d.trip, new Date(d.scheduled).toISOString()]),
    [
      ['11', '2026-10-26T12:00:00.000Z'],
      // 24:20 on Monday's service is 12:20 AM Tuesday.
      ['12', '2026-10-27T04:20:00.000Z'],
    ],
  );
  assert.equal(there[0].headsign, 'BIG TERMINAL');

  // The way back leaves from the terminal's gate and stops across the street.
  const back = g.departures('300', '100', monday, monday + 24 * 3600 * 1000).departures;
  assert.deepEqual(back.map((d) => [d.trip, d.gate, d.stop.code]), [['13', '201_1', '300']]);

  // Removed on 2026-10-28 by calendar_dates; Saturday-only trip shows on Saturday.
  const wed = nyTime(2026, 10, 28, 7, 0);
  assert.deepEqual(g.departures('100', '300', wed, wed + 6 * 3600 * 1000).departures, []);
  const sat = nyTime(2026, 10, 31, 7, 0);
  assert.deepEqual(g.departures('100', '300', sat, sat + 6 * 3600 * 1000).departures.map((d) => d.trip), ['14']);

  assert.equal(g.departures('100', 'nope', monday, monday + 1), null);
});
