import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SNSClient } from '@aws-sdk/client-sns';
import { readFile } from 'node:fs/promises';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { guidanceFor, PROFILES, CONDITIONS, POLLUTANT_KEYS, pollutantsFor, aqiSeries, aqiBandFor, CONFORMAL_DELTA, POLLUTANT_NAMES } from './guidance.mjs';
import { answer, explainSeries, cleanAbout, llmConfigured } from './assistant.mjs';
import { planTrip, MAX_TRIP_KM } from './routes.mjs';
import { subscribe, listSubscribers, alertOne } from './alerts.mjs';
import { jsonFetch, haversineKm, metric, fetchWeather, fetchFires, summariseFires, upwindFires, INDIA_BBOX, fetchHistory, historyCsv, geocode } from './sources.mjs';

// X-Ray: AWS SDK calls and outbound fetch() show up as subsegments; disabled automatically outside Lambda.
const tracer = new Tracer({ serviceName: 'saans-api' });
const ddb = DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})), { marshallOptions: { removeUndefinedValues: true } });
const ssm = tracer.captureAWSv3Client(new SSMClient({}));
const s3 = tracer.captureAWSv3Client(new S3Client({}));
const sns = tracer.captureAWSv3Client(new SNSClient({}));
const alertsEnv = () => ({ ddb, sns, table: process.env.SUBSCRIBERS_TABLE, topic: process.env.ALERTS_TOPIC, getAir });
const TABLE = process.env.CACHE_TABLE;
const CACHE_SECONDS = 300;
const CACHE_VERSION = 'v5';
const MAX_STATIONS = 8;
const CANDIDATE_LOCATIONS = 12;
const MAX_STATION_AGE_MINUTES = 7 * 24 * 60; // older monitors are treated as offline and hidden
const FIRE_DAYS = [1, 3, 7];
const secrets = {};

function reply(statusCode, body, extra = {}) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }, body: JSON.stringify(body) };
}

// Env var for local dev; SSM SecureString in Lambda. Cached per container.
async function getSecret(envName, parameterName) {
  if (process.env[envName]) return process.env[envName];
  if (!parameterName) return null;
  if (secrets[parameterName]) return secrets[parameterName];
  try {
    const parameter = await ssm.send(new GetParameterCommand({ Name: parameterName, WithDecryption: true }));
    return (secrets[parameterName] = parameter.Parameter?.Value || null);
  } catch (error) {
    console.error('Unable to read parameter', parameterName, error.name);
    return null;
  }
}
const getOpenAqKey = () => getSecret('OPENAQ_API_KEY', process.env.OPENAQ_PARAMETER_NAME);
const getFirmsKey = () => getSecret('FIRMS_MAP_KEY', process.env.FIRMS_PARAMETER_NAME);

async function fetchStations(latitude, longitude) {
  const key = await getOpenAqKey();
  if (!key) return { state: 'not_configured', stations: [] };
  try {
    const params = new URLSearchParams({ coordinates: `${latitude},${longitude}`, radius: '25000', parameters_id: '2', limit: '100', page: '1' });
    const list = await jsonFetch(`https://api.openaq.org/v3/locations?${params}`, { headers: { 'X-API-Key': key } }, 'openaq');
    const locations = (list.results || []).map(location => {
      const coords = location.coordinates || {};
      const sensors = (location.sensors || []).filter(sensor => String(sensor.parameter?.name || '').toLowerCase().replaceAll('₂', '2').replaceAll('.', '') === 'pm25' || sensor.parameter?.id === 2);
      return { location, coords, sensors, distanceKm: haversineKm({ latitude, longitude }, coords) };
    }).filter(x => Number.isFinite(x.coords.latitude) && Number.isFinite(x.coords.longitude) && x.sensors.length)
      .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, CANDIDATE_LOCATIONS);
    const stations = await Promise.all(locations.map(async ({ location, coords, sensors, distanceKm }) => {
      try {
        const latest = await jsonFetch(`https://api.openaq.org/v3/locations/${location.id}/latest?limit=100&page=1`, { headers: { 'X-API-Key': key } }, 'openaq');
        const sensorIds = new Set(sensors.map(sensor => sensor.id));
        const reading = (latest.results || []).filter(item => sensorIds.has(item.sensorsId) && Number.isFinite(item.value))
          .sort((a, b) => Date.parse(b.datetime?.utc || 0) - Date.parse(a.datetime?.utc || 0))[0];
        if (!reading) return null;
        const measuredAt = reading.datetime?.utc;
        const ageMinutes = measuredAt ? Math.max(0, (Date.now() - Date.parse(measuredAt)) / 60000) : null;
        if (ageMinutes == null || ageMinutes > MAX_STATION_AGE_MINUTES) return null;
        return { id: String(location.id), name: location.name || 'Unnamed monitoring location', latitude: coords.latitude, longitude: coords.longitude,
          distanceKm: Math.round(distanceKm * 10) / 10, pm2_5: reading.value, unit: sensors[0]?.parameter?.units || 'µg/m³',
          measuredAt, ageMinutes: Math.round(ageMinutes), status: ageMinutes <= 180 ? 'reporting' : 'stale', source: 'OpenAQ' };
      } catch (error) { console.warn('Station read failed', location.id, error.message); return null; }
    }));
    return { state: 'available', stations: stations.filter(Boolean).slice(0, MAX_STATIONS) };
  } catch (error) {
    console.warn('OpenAQ unavailable', error.message);
    return { state: 'temporarily_unavailable', stations: [] };
  }
}

async function fetchForecast(latitude, longitude) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), hourly: POLLUTANT_KEYS.join(','), past_hours: '24', forecast_hours: '96', timezone: 'auto' });
  return jsonFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`, {}, 'open_meteo_cams');
}

const median = values => { const s = [...values].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// A fresh reading far from both its neighbours and the model (>3x either way) is flagged and left out of the estimate.
export function flagOutliers(stations, modelPm) {
  return stations.map(station => {
    const others = stations.filter(s => s !== station).map(s => s.pm2_5);
    if (Number.isFinite(modelPm)) others.push(modelPm);
    if (others.length < 2) return station;
    const ref = median(others);
    const ratio = station.pm2_5 / Math.max(ref, 1);
    return ratio > 3 || ratio < 1 / 3 ? { ...station, flag: 'outlier' } : station;
  });
}

export function makeEstimate(stations, modelPm) {
  const fresh = stations.filter(s => s.status === 'reporting' && !s.flag && s.pm2_5 >= 0 && s.pm2_5 <= 2000);
  if (!fresh.length) return { pm2_5: modelPm, method: 'open_meteo_model', stationCount: 0, range: modelPm == null ? null : [Math.max(0, Math.round(modelPm * .7)), Math.round(modelPm * 1.3)], note: 'Model-only PM2.5 spread; not a validated confidence interval.' };
  const weighted = fresh.map(station => ({ station, weight: 1 / Math.max(.8, station.distanceKm) ** 2 }));
  const value = weighted.reduce((sum, item) => sum + item.station.pm2_5 * item.weight, 0) / weighted.reduce((sum, item) => sum + item.weight, 0);
  const values = fresh.map(x => x.pm2_5).sort((a, b) => a - b);
  const spread = values.length > 1 ? Math.max(values.at(-1) - values[0], value * .12) : value * .25;
  return { pm2_5: Math.round(value * 10) / 10, method: 'distance_weighted_openaq', stationCount: fresh.length,
    range: [Math.max(0, Math.round(value - spread)), Math.round(value + spread)],
    note: 'Distance-weighted latest PM2.5 readings. Range is a simple spread estimate, not a validated statistical interval.' };
}

// ponytail: per-container memory cache in front of DynamoDB; cleared wholesale at 500 keys.
const memoryCache = new Map();

// allowExpired: last-resort fallback when every provider is down (DynamoDB TTL removes items within ~48h).
async function loadCached(key, allowExpired = false) {
  const now = allowExpired ? 0 : Math.floor(Date.now() / 1000);
  const memory = memoryCache.get(key);
  if (memory?.expiresAt > now) return memory.payload;
  if (!TABLE) return null;
  try {
    const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { cacheKey: key }, ConsistentRead: false }));
    if (result.Item?.expiresAt > now) return result.Item.payload;
  } catch (error) { console.error('Cache read failed', error.name); }
  return null;
}

// memoryOnly: large payloads (fire points) would burn the table's 1 WCU, so they stay in the container.
async function saveCached(key, payload, seconds = CACHE_SECONDS, memoryOnly = false) {
  const expiresAt = Math.floor(Date.now() / 1000) + seconds;
  if (memoryCache.size > 500) memoryCache.clear();
  memoryCache.set(key, { payload, expiresAt });
  if (!TABLE || memoryOnly) return;
  try { await ddb.send(new PutCommand({ TableName: TABLE, Item: { cacheKey: key, payload, cachedAt: new Date().toISOString(), expiresAt } })); }
  catch (error) { console.error('Cache write failed', error.name); }
}

// Memory first, then the fetcher; records hit/miss per route.
async function cached(route, key, seconds, fetcher, memoryOnly = false) {
  const hit = memoryOnly ? memoryCache.get(key)?.expiresAt > Date.now() / 1000 && memoryCache.get(key).payload : await loadCached(key);
  metric(hit ? 'CacheHit' : 'CacheMiss', 1, 'Count', { Route: route });
  if (hit) return hit;
  const payload = await fetcher();
  await saveCached(key, payload, seconds, memoryOnly);
  return payload;
}

// Delhi ward GNN forecast, written hourly to S3 by the gnn/ container Lambda (a local file in dev).
async function getWardForecast() {
  return cached('wards', 'wards:v1', 600, async () => {
    if (process.env.WARD_FORECAST_FILE) return JSON.parse(await readFile(process.env.WARD_FORECAST_FILE, 'utf8'));
    if (!process.env.FORECAST_BUCKET) return null;
    const object = await s3.send(new GetObjectCommand({ Bucket: process.env.FORECAST_BUCKET, Key: 'ward-forecast/latest.json' }));
    return JSON.parse(await object.Body.transformToString());
  }, true);
}

function parseCoords(lat, lon) {
  const latitude = Number(lat), longitude = Number(lon);
  if (lat === undefined || lat === '' || lon === undefined || lon === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100 };
}

const MAX_FIRE_POINTS = 4000;
async function getFires(days) {
  const key = await getFirmsKey();
  if (!key) return { state: 'not_configured', days, count: 0, byState: [], points: [] };
  return cached('fires', `fires:v1:${days}`, 1800, async () => {
    const all = await fetchFires(key, days);
    metric('FireDetections', all.length, 'Count', { Days: String(days) });
    // Strongest fires first so the cap drops the faint ones.
    const points = all.length > MAX_FIRE_POINTS ? [...all].sort((a, b) => b[2] - a[2]).slice(0, MAX_FIRE_POINTS) : all;
    return { state: 'available', days, fetchedAt: new Date().toISOString(), count: all.length, shown: points.length, bbox: INDIA_BBOX, byState: summariseFires(all), points,
      source: 'NASA FIRMS VIIRS NOAA-20 NRT (375 m), last 24 h × days, low-confidence detections removed' };
  }, true);
}

// Returns { payload, cache } or throws when no provider produced data.
export async function getAir({ latitude, longitude }) {
  const cacheKey = `air:${CACHE_VERSION}:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
  const cachedPayload = await loadCached(cacheKey);
  metric(cachedPayload ? 'CacheHit' : 'CacheMiss', 1, 'Count', { Route: 'air' });
  if (cachedPayload) return { payload: cachedPayload, cache: 'hit' };
  // NASA is sometimes slow: don't hold the main answer for it. The fetch keeps going and warms the cache for the next request.
  const firesSoon = Promise.race([getFires(1), new Promise((_, reject) => setTimeout(() => reject(new Error('FIRMS slow')), 4000).unref())]);
  const [stationResult, forecastResult, weatherResult, fireResult] = await Promise.allSettled([fetchStations(latitude, longitude), fetchForecast(latitude, longitude), fetchWeather(latitude, longitude), firesSoon]);
  const stationData = stationResult.status === 'fulfilled' ? stationResult.value : { state: 'temporarily_unavailable', stations: [] };
  const forecast = forecastResult.status === 'fulfilled' ? forecastResult.value : { hourly: {}, timezone: 'UTC' };
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const fires = fireResult.status === 'fulfilled' ? fireResult.value : { state: 'temporarily_unavailable', points: [] };
  const hourly = forecast.hourly || {};
  const points = (hourly.time || []).map((time, index) => ({ time, pm2_5: hourly.pm2_5?.[index] ?? null, pm10: hourly.pm10?.[index] ?? null }));
  // Open-Meteo returns local times without an offset; compare in the location's own clock via utc_offset_seconds.
  const nowLocal = Date.now() + (forecast.utc_offset_seconds || 0) * 1000;
  const toMs = time => Date.parse(`${time}Z`);
  const future = points.filter(p => toMs(p.time) >= nowLocal - 30 * 60000);
  const past = points.filter(p => toMs(p.time) < nowLocal - 30 * 60000).map(p => p.pm2_5).filter(Number.isFinite);
  const modelPm = future[0]?.pm2_5 ?? null;
  const stations = flagOutliers(stationData.stations, modelPm);
  if (!stations.length && !future.length && !weather) {
    const stale = await loadCached(cacheKey, true);
    if (stale) return { payload: stale, cache: 'stale' };
    throw new Error('All providers unavailable');
  }
  const estimate = makeEstimate(stations, modelPm);
  const nowIndex = points.indexOf(future[0]);
  // Fresh stations calibrate the model's PM2.5 directly; otherwise the monthly CPCB-anchored factor applies.
  const pmScale = estimate.stationCount && modelPm > 0 ? Math.min(3, Math.max(1 / 3, estimate.pm2_5 / modelPm)) : null;
  const aqiHours = aqiSeries(hourly, pmScale);
  const aqiNow = aqiHours[nowIndex];
  const aqi = aqiNow?.aqi == null ? null : { value: aqiNow.aqi, band: aqiBandFor(aqiNow.aqi), dominant: aqiNow.dominant, dominantName: POLLUTANT_NAMES[aqiNow.dominant], subIndices: aqiNow.subIndices,
    method: pmScale ? 'cpcb_rolling_station_scaled_cams' : 'cpcb_rolling_bias_corrected_cams',
    outlook: [24, 48, 72].map(h => aqiHours[nowIndex + h]).map((p, k) => {
      const h = [24, 48, 72][k];
      return p?.aqi == null ? null : { hours: h, time: p.time, aqi: p.aqi, low: Math.max(0, Math.round(p.aqi - CONFORMAL_DELTA[h])), high: Math.round(p.aqi + CONFORMAL_DELTA[h]), band: aqiBandFor(p.aqi), dominant: p.dominant };
    }).filter(Boolean),
    note: 'Indicative AQI: CPCB method (24 h averages, 8 h for O3/CO, max sub-index) on CAMS model data, PM bias-corrected with CPCB-anchored monthly factors or nearby monitors. Outlook ranges are the 80% conformal widths calibrated for the Delhi ward model. Not the official CPCB AQI.' };
  const payload = { location: { latitude, longitude, timezone: forecast.timezone || 'UTC' },
    observedAt: new Date().toISOString(), estimate, stations,
    forecast: future.slice(0, 48).map((p, k) => ({ ...p, aqi: aqiHours[nowIndex + k]?.aqi ?? null })),
    aqi,
    model: { nowPm2_5: modelPm, past24hMeanPm2_5: past.length ? Math.round(past.reduce((a, b) => a + b, 0) / past.length * 10) / 10 : null },
    guidance: guidanceFor(estimate.pm2_5),
    // Current model hour for every pollutant; PM2.5 uses the same estimate as the headline number.
    pollutants: pollutantsFor({ ...Object.fromEntries(POLLUTANT_KEYS.map(key => [key, hourly[key]?.[points.indexOf(future[0])]])), pm2_5: estimate.pm2_5 }),
    weather,
    fires: fires.state === 'available' && weather ? { state: 'available', days: 1, ...upwindFires(fires.points, { latitude, longitude }, weather.fromDeg) } : { state: fires.state },
    sources: { stations: stationData.state, forecast: forecastResult.status === 'fulfilled' ? 'open_meteo_cams_model' : 'temporarily_unavailable',
      weather: weather ? 'open_meteo_weather_model' : 'temporarily_unavailable', fires: fires.state, labels: { pm2_5: 'PM2.5 concentration' } },
    disclaimer: 'PM2.5 monitor observations and model forecasts are shown as separate sources. This is not an official CPCB National AQI; official AQI requires pollutant-specific averaging and sub-indices. This service does not provide medical advice.' };
  // A provider outage (e.g. OpenAQ rate limit) is cached briefly so it recovers quickly.
  const degraded = stationData.state === 'temporarily_unavailable' || forecastResult.status !== 'fulfilled' || !weather || fires.state === 'temporarily_unavailable';
  await saveCached(cacheKey, payload, degraded ? 60 : CACHE_SECONDS);
  return { payload, cache: 'miss' };
}

function parseBody(event) {
  try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}'); }
  catch { return null; }
}

const unavailable = () => reply(502, { error: 'upstream_unavailable', message: 'Live data is temporarily unavailable. Please retry shortly.' });

async function route(event) {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') return reply(204, {});
  const path = event.rawPath || event.path || '';
  const query = event.queryStringParameters || {};
  tracer.putAnnotation('route', path.split('/').pop() || 'root');
  if (path.endsWith('/health')) return reply(200, { status: 'ok', service: 'saans-api', time: new Date().toISOString(), assistant: process.env.BEDROCK_MODEL_ID ? 'bedrock' : 'rules', llm: llmConfigured() });

  if (path.endsWith('/ask')) {
    if (method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const body = parseBody(event);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const coords = parseCoords(body?.lat, body?.lon);
    if (!question || question.length > 300 || !coords) return reply(400, { error: 'invalid_request', message: 'Provide a question (up to 300 characters) and valid lat/lon.' });
    const profile = PROFILES.includes(body.profile) ? body.profile : 'general';
    const lang = body.lang === 'hi' ? 'hi' : 'en';
    const place = typeof body.place === 'string' ? body.place.slice(0, 60) : '';
    const conditions = Array.isArray(body.conditions) ? body.conditions.filter(c => CONDITIONS.includes(c)) : [];
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const about = cleanAbout(body.about);
    try {
      const { payload } = await getAir(coords);
      const result = await answer(question, payload, { profile, lang, place, conditions, history, about });
      metric('AskAnswered', 1, 'Count', { Mode: result.mode });
      tracer.putAnnotation('askMode', result.mode);
      return reply(200, result);
    } catch (error) {
      console.error('Ask failed', error.name);
      return unavailable();
    }
  }

  if (path.endsWith('/alerts')) {
    if (method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!process.env.ALERTS_TOPIC || !process.env.SUBSCRIBERS_TABLE) return reply(503, { error: 'not_configured', message: 'Email alerts are not set up on this server.' });
    const body = parseBody(event);
    const coords = parseCoords(body?.lat, body?.lon);
    if (!body || !coords) return reply(400, { error: 'invalid_request', message: 'Provide an email and valid lat/lon.' });
    try {
      const result = await subscribe(alertsEnv(), body, coords);
      metric('AlertSubscribe', 1, 'Count', { Status: String(result.status) });
      return reply(result.status, result.body);
    } catch (error) { console.error('Subscribe failed', error.name, error.message); return unavailable(); }
  }

  if (method !== 'GET') return reply(404, { error: 'not_found' });

  if (path.endsWith('/route')) {
    const parse = v => { const [lat, lon] = String(v || '').split(','); return parseCoords(lat, lon); };
    const from = parse(query.from), to = parse(query.to);
    if (!from || !to) return reply(400, { error: 'invalid_coordinates', message: 'Provide from and to as lat,lon.' });
    const km = haversineKm(from, to);
    if (km < 0.5 || km > MAX_TRIP_KM) return reply(400, { error: 'invalid_distance', message: `Trips must be between 0.5 and ${MAX_TRIP_KM} km apart.` });
    try {
      const trip = await cached('route', `route:v1:${from.latitude}:${from.longitude}:${to.latitude}:${to.longitude}`, 1800, async () => {
        const fires = await Promise.race([getFires(1), new Promise(resolve => setTimeout(resolve, 4000, null).unref())]).catch(() => null);
        return planTrip(from, to, fires?.state === 'available' ? fires.points : null);
      }, true);
      return reply(200, trip, { 'cache-control': 'public, max-age=900' });
    } catch (error) {
      console.error('Route failed', error.message);
      // OSRM answers 400 / NoRoute across water or outside its road graph.
      if (/OSRM|returned 400/.test(error.message)) return reply(200, { state: 'no_route', message: 'No driving route found between these places.' });
      return unavailable();
    }
  }

  if (path.endsWith('/geocode')) {
    const q = String(query.q || '').trim();
    if (q.length < 2 || q.length > 60) return reply(400, { error: 'invalid_query', message: 'Provide q with 2 to 60 characters.' });
    try {
      const results = await cached('geocode', `geo:v1:${q.toLowerCase()}`, 86400, () => geocode(q), true);
      return reply(200, { query: q, results, source: 'open_meteo_geocoding' }, { 'cache-control': 'public, max-age=86400' });
    } catch (error) { console.error('Geocode failed', error.message); return unavailable(); }
  }

  if (path.endsWith('/fires')) {
    const days = FIRE_DAYS.includes(Number(query.days)) ? Number(query.days) : 1;
    try {
      const fires = await getFires(days);
      return reply(200, fires, fires.state === 'available' ? { 'cache-control': 'public, max-age=600' } : {});
    } catch (error) { console.error('Fires failed', error.message); return unavailable(); }
  }

  if (path.endsWith('/ward-forecast')) {
    try {
      const data = await getWardForecast();
      if (!data) return reply(200, { state: 'not_configured' });
      const near = parseCoords(query.lat, query.lon);
      // Only answer "your ward" inside Delhi: the nearest ward centroid must be within 6 km.
      const nearest = near && data.wards.map(w => ({ ...w, distanceKm: Math.round(haversineKm(near, { latitude: w.lat, longitude: w.lon }) * 10) / 10 })).sort((a, b) => a.distanceKm - b.distanceKm)[0];
      return reply(200, { state: 'available', ...data, nearest: nearest?.distanceKm <= 6 ? nearest : null }, { 'cache-control': 'public, max-age=600' });
    } catch (error) { console.error('Ward forecast failed', error.name); return reply(200, { state: 'temporarily_unavailable' }); }
  }

  const coords = parseCoords(query.lat, query.lon);
  if (!coords) return reply(400, { error: 'invalid_coordinates', message: 'Provide lat and lon within valid WGS84 bounds.' });

  if (path.endsWith('/history')) {
    const days = Math.min(92, Math.max(7, Math.round(Number(query.days) || 30)));
    try {
      const history = await cached('history', `hist:v1:${coords.latitude}:${coords.longitude}:${days}`, 6 * 3600, () => fetchHistory(coords.latitude, coords.longitude, days));
      if (query.format === 'csv') return { statusCode: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="saans-history-${coords.latitude}-${coords.longitude}-${days}d.csv"` }, body: historyCsv(history) };
      return reply(200, history, { 'cache-control': 'public, max-age=3600' });
    } catch (error) { console.error('History failed', error.message); return unavailable(); }
  }

  if (path.endsWith('/explain')) {
    const kind = query.kind === 'history' ? 'history' : 'forecast';
    const lang = query.lang === 'hi' ? 'hi' : 'en';
    const days = Number(query.days) === 90 ? 90 : 30;
    try {
      const result = await cached('explain', `explain:v1:${kind}:${lang}:${kind === 'history' ? days : 0}:${coords.latitude}:${coords.longitude}`, kind === 'history' ? 6 * 3600 : CACHE_SECONDS, async () => {
        if (kind === 'history') {
          const h = await cached('history', `hist:v1:${coords.latitude}:${coords.longitude}:${days}`, 6 * 3600, () => fetchHistory(coords.latitude, coords.longitude, days));
          return explainSeries({ kind, lang, place: query.place?.slice(0, 60), points: h.rows.map(r => ({ time: r.date, value: r.pm2_5 })),
            drivers: Object.fromEntries(h.rows.map(r => [r.date, { blhM: r.blhM, windKmh: r.windKmh, rainMm: r.precipitationMm, ventilation: r.ventilation }])) });
        }
        const { payload } = await getAir(coords);
        return explainSeries({ kind, lang, place: query.place?.slice(0, 60), points: payload.forecast.map(p => ({ time: p.time, value: p.pm2_5 })),
          drivers: Object.fromEntries((payload.weather?.hourly || []).map(w => [w.time, { blhM: w.blhM, windKmh: w.speedKmh, rainMm: w.rainMm, ventilation: w.ventilation }])),
          fires: payload.fires?.state === 'available' ? { count: payload.fires.count, nearestKm: payload.fires.nearestKm } : null });
      });
      metric('ExplainAnswered', 1, 'Count', { Mode: result.mode });
      return reply(200, result);
    } catch (error) { console.error('Explain failed', error.message); return unavailable(); }
  }

  if (!path.endsWith('/air')) return reply(404, { error: 'not_found' });
  try {
    const { payload, cache } = await getAir(coords);
    return reply(200, { ...payload, cache, ...(cache === 'stale' && { warning: 'Live providers are unavailable; showing the last cached response.' }) }, cache === 'stale' ? {} : { 'cache-control': 'public, max-age=120' });
  } catch (error) {
    console.error('Air endpoint failed', error.name);
    return unavailable();
  }
}

// AlertsFunction, called by the alerts state machine: { action: 'list' } -> { emails }, { action: 'send', email, now } -> { email, result }.
export const alerts = async event => {
  if (event?.action === 'list') return { emails: await listSubscribers(alertsEnv()) };
  if (event?.action !== 'send' || typeof event.email !== 'string') throw new Error('Unknown alerts action');
  const result = await alertOne(alertsEnv(), event.email, event.now ? new Date(event.now) : new Date());
  metric(`Alerts_${result}`, 1, 'Count', { Service: 'saans-alerts' });
  return { email: event.email, result };
};

// Manual Powertools pattern: annotations need a subsegment because the Lambda facade segment is read-only.
export const handler = async event => {
  if (!tracer.isTracingEnabled()) return route(event);
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  if (subsegment) tracer.setSegment(subsegment);
  tracer.annotateColdStart();
  try {
    const result = await route(event);
    tracer.putAnnotation('status', result.statusCode);
    return result;
  } catch (error) {
    tracer.addErrorAsMetadata(error);
    throw error;
  } finally {
    if (subsegment) { subsegment.close(); tracer.setSegment(segment); }
  }
};
