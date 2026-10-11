// Run: node backend/selfcheck.mjs  (fails loudly if band, outlier or estimate logic breaks)
import assert from 'node:assert/strict';
import { bandFor, actionsFor, compass, pollutantsFor, PROFILES, CONDITIONS, subIndex, aqiBandFor, aqiSeries } from './src/guidance.mjs';
import { flagOutliers, makeEstimate } from './src/handler.mjs';
import { ruleAnswer, chatTurns, findAnomalies, anomalyNote, cleanAbout, exposurePriorities } from './src/assistant.mjs';
import { samplePath, scoreTrip, firesNear, blendStations } from './src/routes.mjs';
import { validEmail, subscriberId, shouldSend, alertMessage, alertOne, advisoryText, advisoriesNear, sendAdvisory } from './src/alerts.mjs';
import { ventilation, parseFiresCsv, recentFires,stateOf, summariseFires, upwindFires, bearing, backtest, pearson, historyCsv, parseGeocode, parsePlaces } from './src/sources.mjs';

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
// Onboarding answers: whitelist only, and they personalise the indoor answer
assert.deepEqual(cleanAbout({ age: 'senior', work: 'hacker', floor: 'ground', near: ['road', 'moon'], smoker: true, purifier: 'yes' }), { age: 'senior', floor: 'ground', near: ['road'], smoker: true });
assert.equal(cleanAbout('x'), null);
assert.match(ruleAnswer('How do I keep my home air clean?', air, { profile: 'general', lang: 'en', place: 'Delhi', about: { fuel: 'solid', near: ['road'], floor: 'low' } }), /wood, coal.*low floor near a main road/);
assert.ok(CONDITIONS.includes('eye') && CONDITIONS.includes('sinus'));
// Personal priorities: indoor smoke first, then cooking fuel, work, home surroundings; at most three; none without answers
const prio = exposurePriorities(cleanAbout({ smoker: true, fuel: 'solid', work: 'delivery', near: ['construction'], floor: 'high' }));
assert.deepEqual(prio.map(p => p.split(':')[0]), ['someone smokes indoors', 'cooks on wood, coal or dung', 'riding in traffic']);
assert.match(exposurePriorities({ near: ['road'], floor: 'ground' })[0], /^low floor by a main road/);
assert.deepEqual(exposurePriorities({ near: ['road'], floor: 'high' }), []);
assert.deepEqual(exposurePriorities(null), []);

// Trip planner: even samples by distance, departure scoring, fires near the path
const line = samplePath([[77, 28], [77, 28.5], [77, 29]], 3);
assert.deepEqual(line.map(p => p.lat), [28, 28.5, 29]);
assert.ok(Math.abs(line[2].km - 111.2) < 1);
const trip = [{ minute: 0, pm: [100, 40], vis: [1500, 9000] }, { minute: 70, pm: [100, 80, 20], vis: [9000, 9000, 9000] }];
assert.deepEqual(scoreTrip(trip, 0, 10), { avgPm: 90, maxPm: 100, minVisKm: 1.5, hazyKm: 10 }); // second point is reached an hour later
assert.deepEqual(scoreTrip(trip, 1, 10), { avgPm: 30, maxPm: 40, minVisKm: 9, hazyKm: 0 });
assert.equal(firesNear(line, [[28.5, 77.05, 5], [28.5, 77.5, 5], [20, 70, 5]]), 1);
// Monitors: a sample next to a 150 reading doubles a 75 model series; one 20 km away is left on the model
const st = [{ id: 'x', name: 'Rohini', latitude: 28.73, longitude: 77.12, pm2_5: 150 }];
const blended = blendStations([{ lat: 28.731, lon: 77.12, pm: [75, 50] }, { lat: 28.55, lon: 77.12, pm: [75, 50] }], st);
assert.deepEqual(blended[0].pm, [150, 100]);
assert.equal(blended[0].monitors[0].name, 'Rohini');
assert.deepEqual([blended[1].pm, blended[1].monitors], [[75, 50], []]);
assert.deepEqual(parsePlaces([{ Title: 'Delhi Technological University (Dtu)', Position: [77.11765, 28.74451], Address: { Label: 'Bawana Main Road, Rohini, Delhi 110042, India', District: 'Rohini', Region: { Name: 'Delhi' } } }]),
  [{ name: 'Delhi Technological University (Dtu)', district: 'Rohini', state: 'Delhi', latitude: 28.74451, longitude: 77.11765, label: 'Bawana Main Road, Rohini, Delhi 110042' }]);

// Alerts: email check, stable id, quiet hours, "changes" only on a band move, ASCII subject
assert.ok(validEmail('a.b@example.in') && !validEmail('nope@x') && !validEmail('a b@c.de'));
assert.equal(subscriberId(' A@B.com '), subscriberId('a@b.com'));
const alertAir = { location: { timezone: 'Asia/Kolkata' }, aqi: { value: 212, band: aqiBandFor(212), dominantName: 'PM2.5' }, estimate: { pm2_5: 95 },
  forecast: [212, 215, 220, 230, 200, 180].map((aqi, i) => ({ time: `2026-10-11T${String(14 + i).padStart(2, '0')}:00`, aqi })), fires: { state: 'available', count: 7 } };
const noon = new Date('2026-10-11T07:00:00Z'), night = new Date('2026-10-11T19:00:00Z'); // 12:30 and 00:30 IST
assert.equal(shouldSend({ freq: 'hourly', lastBand: 3 }, alertAir, noon), true);
assert.equal(shouldSend({ freq: 'changes', lastBand: 3 }, alertAir, noon), false);
assert.equal(shouldSend({ freq: 'changes', lastBand: 2 }, alertAir, noon), true);
assert.equal(shouldSend({ freq: 'hourly', lastBand: 2 }, alertAir, night), false); // poor is not urgent enough to wake anyone
const msg = alertMessage({ place: 'Lajpat Nagar, दिल्ली', profile: 'children', conditions: ['asthma'] }, alertAir);
assert.equal(msg.subject, 'Saans: AQI 212 Poor in Lajpat Nagar,');
assert.match(msg.text, /Getting worse.*\n.*Cleanest stretch.*19:00 \(AQI ~180\)[\s\S]*inhaler[\s\S]*7 farm or forest fires/);
assert.match(alertMessage({ lang: 'hi' }, alertAir).text, /क्या करें/);

// alertOne (one Step Functions Map item): stub clients keyed by command name
const sent = [];
const stubEnv = (item, attrs, failUpdate = false) => ({ table: 't', topic: 'arn:topic', getAir: async () => ({ payload: alertAir }),
  ddb: { send: async c => { const n = c.constructor.name; sent.push(n);
    if (n === 'GetCommand') return { Item: item };
    if (n === 'UpdateCommand' && failUpdate) throw new Error('throttled');
    return {}; } },
  sns: { send: async c => { const n = c.constructor.name; sent.push(n); return n === 'GetSubscriptionAttributesCommand' ? attrs : {}; } } });
const subItem = { email: 'a@b.com', id: 'x', subscriptionArn: 'arn:sub', freq: 'hourly', lastBand: 3, latitude: 28.6, longitude: 77.2 };
assert.equal(await alertOne(stubEnv(undefined), 'gone@b.com', noon), 'removed');
assert.equal(await alertOne(stubEnv(subItem, { Attributes: { PendingConfirmation: 'true' } }), 'a@b.com', noon), 'pending');
assert.equal(await alertOne(stubEnv(subItem, { Attributes: {} }), 'a@b.com', night), 'skipped');
assert.equal(await alertOne(stubEnv(subItem, { Attributes: {} }, true), 'a@b.com', noon), 'sent'); // recorded-or-not, no throw after Publish
assert.ok(sent.includes('PublishCommand'));

// Advisory: bilingual text from live data, area filter, expiry, and the one-per-5-min limit
const adv = advisoryText(alertAir, 'Lajpat Nagar');
assert.match(adv.en.text, /^Air quality advisory for Lajpat Nagar[\s\S]*AQI 212 \(Poor\)[\s\S]*Everyone:\n- /);
assert.match(adv.hi.text, /परामर्श[\s\S]*सभी के लिए/);
const t0 = Date.parse('2026-10-11T07:00:00Z');
const list = [{ latitude: 28.57, longitude: 77.24, radiusKm: 5, expiresAt: t0 + 1 }, { latitude: 28.57, longitude: 77.24, radiusKm: 5, expiresAt: t0 - 1 }, { latitude: 19.07, longitude: 72.87, radiusKm: 5, expiresAt: t0 + 1 }];
assert.equal(advisoriesNear(list, { latitude: 28.6, longitude: 77.25 }, t0).length, 1);
const published = [];
const advEnv = { topic: 't', getAir: async () => ({ payload: alertAir }),
  ddb: { send: async c => c.constructor.name === 'ScanCommand' ? { Items: [{ id: 'near', latitude: 28.58, longitude: 77.25, lang: 'hi' }, { id: 'far', latitude: 19.07, longitude: 72.87 }] } : {} },
  sns: { send: async c => { published.push(c.input); return {}; } } };
const first = await sendAdvisory(advEnv, { latitude: 28.57, longitude: 77.24 }, 'Lajpat Nagar', t0);
assert.equal(first.status, 200); assert.equal(first.body.recipients, 1);
assert.match(published[0].Message, /^Lajpat Nagar के लिए/); // subscriber's language first
assert.equal((await sendAdvisory(advEnv, { latitude: 28.57, longitude: 77.24 }, 'Lajpat Nagar', t0 + 60e3)).status, 429);
assert.equal((await sendAdvisory(advEnv, { latitude: 28.57, longitude: 77.24 }, 'Lajpat Nagar', t0 + 301e3)).status, 200);
console.log('selfcheck ok');
