// Run: node backend/selfcheck.mjs  (fails loudly if band, outlier or estimate logic breaks)
import assert from 'node:assert/strict';
import { bandFor, actionsFor, compass, pollutantsFor, PROFILES } from './src/guidance.mjs';
import { flagOutliers, makeEstimate } from './src/handler.mjs';
import { ruleAnswer } from './src/assistant.mjs';

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

const air = { location: { latitude: 28.6, longitude: 77.2 }, estimate: { pm2_5: 95 }, guidance: { band: { ...bandFor(95), label: bandFor(95).label } }, forecast: [], wind: { speedKmh: 8, fromCompass: 'NW' } };
assert.match(ruleAnswer('Should I go for a run?', air, { profile: 'older', lang: 'en', place: 'Delhi' }), /Poor/);
assert.match(ruleAnswer('मास्क?', air, { profile: 'general', lang: 'hi', place: 'Delhi' }), /N95/);
console.log('selfcheck ok');
