// Run: node backend/selfcheck.mjs  (fails loudly if band, outlier or estimate logic breaks)
import assert from 'node:assert/strict';
import { bandFor, actionsFor, compass, pollutantsFor, PROFILES, CONDITIONS, subIndex, aqiBandFor, aqiSeries } from './src/guidance.mjs';
import { flagOutliers, makeEstimate } from './src/handler.mjs';
import { ruleAnswer, chatTurns, findAnomalies, anomalyNote } from './src/assistant.mjs';
import { ventilation, parseFiresCsv, recentFires,stateOf, summariseFires, upwindFires, bearing, backtest, pearson, historyCsv, parseGeocode } from './src/sources.mjs';

assert.deepEqual([0, 30, 30.1, 60, 90, 120, 250, 251].map(pm => bandFor(pm).key), ['good', 'good', 'satisfactory', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe']);
assert.ok(actionsFor(3, 'children').en.length > actionsFor(3, 'general').en.length);
for (const p of PROFILES) for (let i = 0; i < 6; i++) { const a = actionsFor(i, p); assert.equal(a.en.length, a.hi.length, `${p} ${i}`); }
assert.ok(actionsFor(3, 'outdoor_worker').en.some(t => t.includes('N95')));
assert.equal(actionsFor(4, 'commuter').en.filter(t => t.includes('N95')).length, 1); // no duplicate mask advice
const pol = pollutantsFor({ pm10: 120, carbon_monoxide: 2500, ozone: null });
assert.deepEqual(pol.map(p => [p.key, p.value, p.level.key]), [['pm10', 120, 'moderate'], ['carbon_monoxide', 2.5, 'moderate']]);
assert.equal(compass(315), 'NW');
// Health conditions stack on the persona, en/hi in step
for (const c of CONDITIONS) for (let i = 0; i < 6; i++) { const a = actionsFor(i, 'general', [c]); assert.equal(a.en.length, a.hi.length, `${c} ${i}`); }
assert.equal(actionsFor(3, 'general', ['asthma']).en.length, actionsFor(3, 'general').en.length + 2);

// CPCB AQI (port of build_gnn_dataset.cpcb_aqi): sub-index interpolation, bands, rolling series with bias factors
assert.equal(subIndex('pm2_5', 45), 75);
assert.equal(subIndex('pm2_5', 600), 500);
assert.equal(subIndex('carbon_monoxide', 1.5), 75);
assert.deepEqual([50, 51, 150, 250, 350, 401].map(a => aqiBandFor(a).key), ['good', 'satisfactory', 'moderate', 'poor', 'very_poor', 'severe']);
const hours = Array.from({ length: 30 }, (_, i) => `2026-10-${String(9 + (i >> 4)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00`);
const flat = v => hours.map(() => v);
const series = aqiSeries({ time: hours, pm2_5: flat(100), pm10: flat(100), nitrogen_dioxide: flat(40), ozone: flat(30), carbon_monoxide: flat(800), sulphur_dioxide: flat(10) });
assert.equal(series[0].aqi, null); // not enough hours for a 24 h mean
assert.deepEqual([series.at(-1).aqi, series.at(-1).dominant], [267, 'pm2_5']); // 100 × 1.10 (October) = 110 µg/m³
assert.equal(aqiSeries({ time: hours, pm2_5: flat(100), pm10: flat(10), nitrogen_dioxide: flat(10) }, 1).at(-1).aqi, 233);

// Chat history: alternating turns starting with the user, latest question last
assert.deepEqual(chatTurns([{ role: 'assistant', text: 'hi' }, { role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }, { role: 'user', text: 'c' }], 'q').map(t => [t.role, t.content[0].text]),
  [['user', 'a'], ['assistant', 'b'], ['user', 'q']]);
// Anomalies: one spike in a flat series, explained by a shallow mixing layer
const pts = Array.from({ length: 24 }, (_, i) => ({ time: `2026-10-10T${String(i).padStart(2, '0')}:00`, value: i === 10 ? 150 : 50 + (i % 3) }));
const an = findAnomalies(pts);
assert.deepEqual(an.map(a => [a.time, a.kind]), [['2026-10-10T10:00', 'spike']]);
assert.match(anomalyNote(an[0], { blhM: 200, windKmh: 4 }, { blhM: 800, windKmh: 10 }, null, 'en'), /shallow mixing layer.*light winds/);
assert.deepEqual(findAnomalies(pts.map(p => ({ ...p, value: 50 }))), []);

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
