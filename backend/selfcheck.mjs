// Run: node backend/selfcheck.mjs  (fails loudly if band, outlier or estimate logic breaks)
import assert from 'node:assert/strict';
import { bandFor, actionsFor, compass, pollutantsFor, PROFILES } from './src/guidance.mjs';
import { flagOutliers, makeEstimate } from './src/handler.mjs';
import { ruleAnswer } from './src/assistant.mjs';
import { ventilation, parseFiresCsv, recentFires,stateOf, summariseFires, upwindFires, bearing, backtest, pearson, historyCsv, parseGeocode } from './src/sources.mjs';

assert.deepEqual([0, 30, 30.1, 60, 90, 120, 250, 251].map(pm => bandFor(pm).key), ['good', 'good', 'satisfactory', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe']);
assert.ok(actionsFor(3, 'children').en.length > actionsFor(3, 'general').en.length);
for (const p of PROFILES) for (let i = 0; i < 6; i++) { const a = actionsFor(i, p); assert.equal(a.en.length, a.hi.length, `${p} ${i}`); }
assert.ok(actionsFor(3, 'outdoor_worker').en.some(t => t.includes('N95')));
assert.equal(actionsFor(4, 'commuter').en.filter(t => t.includes('N95')).length, 1); // no duplicate mask advice
const pol = pollutantsFor({ pm10: 120, carbon_monoxide: 2500, ozone: null });
assert.deepEqual(pol.map(p => [p.key, p.value, p.level.key]), [['pm10', 120, 'moderate'], ['carbon_monoxide', 2.5, 'moderate']]);
assert.equal(compass(315), 'NW');

const s = (pm2_5, distanceKm = 2, status = 'reporting') => ({ pm2_5, distanceKm, status });
const flagged = flagOutliers([s(40), s(45), s(295)], 50);
assert.deepEqual(flagged.map(x => x.flag), [undefined, undefined, 'outlier']);
const est = makeEstimate(flagged, 50);
assert.equal(est.stationCount, 2);
assert.ok(est.pm2_5 > 40 && est.pm2_5 < 45);
assert.equal(makeEstimate([s(80, 1, 'stale')], 61).method, 'open_meteo_model');

// Weather: IMD ventilation index
assert.deepEqual(ventilation(7.2, 300), { index: 600, label: 'poor' });
assert.equal(ventilation(36, 900).label, 'good');
assert.equal(ventilation(18, 1000).label, 'low');
assert.equal(ventilation(10, null), null);

// FIRMS CSV: low confidence dropped, time padded, states assigned
const csv = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
30.9,75.8,330,0.4,0.4,2026-10-09,812,N,VIIRS,n,2.0NRT,290,12.5,D
29.1,76.1,320,0.4,0.4,2026-10-09,0812,N,VIIRS,h,2.0NRT,290,30,D
26.8,80.9,310,0.4,0.4,2026-10-09,1930,N,VIIRS,l,2.0NRT,290,2,N
19.0,73.0,310,0.4,0.4,2026-10-09,1930,N,VIIRS,n,2.0NRT,290,4,N`;
const fires = parseFiresCsv(csv);
assert.equal(fires.length, 3);
assert.deepEqual(fires[0], [30.9, 75.8, 12.5, 'n', '2026-10-09 0812']);
assert.deepEqual(['Delhi', 'Punjab', 'Haryana', 'Uttar Pradesh', 'Elsewhere'], [stateOf(28.6, 77.2), stateOf(30.9, 75.8), stateOf(29.1, 76.1), stateOf(26.8, 80.9), stateOf(19, 73)]);
assert.deepEqual(summariseFires(fires).map(x => x.state).sort(), ['Elsewhere', 'Haryana', 'Punjab']);
assert.throws(() => parseFiresCsv('Invalid MAP_KEY.'));
assert.deepEqual(parseFiresCsv(csv.split('\n')[0]), []); // header only = no fires, not an error
// rolling window: the two 08:12 UTC fires are kept 23 h later, dropped 25 h later (the 19:30 one stays)
assert.equal(recentFires(fires, 1, Date.parse('2026-10-10T07:12:00Z')).length, 3);
assert.equal(recentFires(fires, 1, Date.parse('2026-10-10T09:12:00Z')).length, 1);
// Delhi with a north-west wind: Punjab/Haryana fires are upwind, Mumbai is not
const delhi = { latitude: 28.6, longitude: 77.2 };
assert.ok(Math.abs(bearing(delhi, { latitude: 30.9, longitude: 75.8 }) - 333) < 5);
const up = upwindFires(fires, delhi, 315);
assert.equal(up.count, 2);
assert.deepEqual(up.topStates.map(x => x.state).sort(), ['Haryana', 'Punjab']);
assert.equal(upwindFires(fires, delhi, 135).count, 0); // south-east wind: nothing upwind

// History backtest + CSV
const rows = [10, 20, 30, 40, 50, 60].map((v, i) => ({ date: `2026-09-0${i + 1}`, pm2_5: 120 - v, ventilation: v * 200 }));
const bt = backtest(rows);
assert.equal(bt.poorVentilationDays, 2);
assert.ok(bt.meanPm2_5PoorVentilation > bt.meanPm2_5GoodVentilation);
assert.equal(pearson([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1);
assert.match(historyCsv({ rows: [{ date: '2026-09-01', pm2_5: 50, temperatureC: null }] }), /^date,.*\n2026-09-01,50,,/);
assert.deepEqual(parseGeocode({ results: [{ name: 'Lajpat Nagar', admin2: 'South East', admin1: 'National Capital Territory of Delhi', latitude: 28.57, longitude: 77.24 }] })[0].label, 'Lajpat Nagar, South East, National Capital Territory of Delhi');

const air = { location: { latitude: 28.6, longitude: 77.2 }, estimate: { pm2_5: 95 }, guidance: { band: { ...bandFor(95), label: bandFor(95).label } }, forecast: [],
  weather: { speedKmh: 8, fromCompass: 'NW', blhM: 300, ventilation: { index: 667, label: 'poor' } }, fires: { state: 'available', count: 12, rangeKm: 500, nearestKm: 180, topStates: [{ state: 'Punjab', count: 9 }], nearbyCount: 0 } };
assert.match(ruleAnswer('Should I go for a run?', air, { profile: 'older', lang: 'en', place: 'Delhi' }), /Poor/);
assert.match(ruleAnswer('मास्क?', air, { profile: 'general', lang: 'hi', place: 'Delhi' }), /N95/);
assert.match(ruleAnswer('Is stubble smoke coming?', air, { profile: 'general', lang: 'en', place: 'Delhi' }), /12 fires upwind.*Punjab/);
assert.match(ruleAnswer('Why is the air so bad today?', air, { profile: 'general', lang: 'en', place: 'Delhi' }), /trapped/);
console.log('selfcheck ok');
