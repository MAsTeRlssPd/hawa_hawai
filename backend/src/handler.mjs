import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { guidanceFor, compass, PROFILES, POLLUTANT_KEYS, pollutantsFor } from './guidance.mjs';
import { answer } from './assistant.mjs';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ssm = new SSMClient({});
const TABLE = process.env.CACHE_TABLE;
const PARAMETER_NAME = process.env.OPENAQ_PARAMETER_NAME;
const CACHE_SECONDS = 300;
const CACHE_VERSION = 'v3';
const MAX_STATIONS = 8;
const CANDIDATE_LOCATIONS = 12;
const MAX_STATION_AGE_MINUTES = 7 * 24 * 60; // older monitors are treated as offline and hidden
let cachedApiKey;

function reply(statusCode, body, extra = {}) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }, body: JSON.stringify(body) };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json();
}

async function getOpenAqKey() {
  if (cachedApiKey) return cachedApiKey;
  if (process.env.OPENAQ_API_KEY) return process.env.OPENAQ_API_KEY; // local dev only; Lambda uses SSM
  if (!PARAMETER_NAME) return null;
  try {
    const parameter = await ssm.send(new GetParameterCommand({ Name: PARAMETER_NAME, WithDecryption: true }));
    cachedApiKey = parameter.Parameter?.Value || null;
    return cachedApiKey;
  } catch (error) {
    console.error('Unable to read OpenAQ parameter', error.name);
    return null;
  }
}

const haversineKm = (a, b) => {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

async function fetchStations(latitude, longitude) {
  const key = await getOpenAqKey();
  if (!key) return { state: 'not_configured', stations: [] };
  try {
    const params = new URLSearchParams({ coordinates: `${latitude},${longitude}`, radius: '25000', parameters_id: '2', limit: '100', page: '1' });
    const list = await jsonFetch(`https://api.openaq.org/v3/locations?${params}`, { headers: { 'X-API-Key': key } });
    const locations = (list.results || []).map(location => {
      const coords = location.coordinates || {};
      const sensors = (location.sensors || []).filter(sensor => String(sensor.parameter?.name || '').toLowerCase().replaceAll('₂', '2').replaceAll('.', '') === 'pm25' || sensor.parameter?.id === 2);
      return { location, coords, sensors, distanceKm: haversineKm({ latitude, longitude }, coords) };
    }).filter(x => Number.isFinite(x.coords.latitude) && Number.isFinite(x.coords.longitude) && x.sensors.length)
      .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, CANDIDATE_LOCATIONS);
    const stations = await Promise.all(locations.map(async ({ location, coords, sensors, distanceKm }) => {
      try {
        const latest = await jsonFetch(`https://api.openaq.org/v3/locations/${location.id}/latest?limit=100&page=1`, { headers: { 'X-API-Key': key } });
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
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), hourly: POLLUTANT_KEYS.join(','), past_hours: '24', forecast_hours: '48', timezone: 'auto' });
  return jsonFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
}

async function fetchWind(latitude, longitude) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'wind_speed_10m,wind_direction_10m', forecast_hours: '24', wind_speed_unit: 'kmh', timezone: 'auto' });
  const data = await jsonFetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  const current = data.current || {};
  return { speedKmh: Math.round(current.wind_speed_10m), gustKmh: Math.round(current.wind_gusts_10m), fromDeg: current.wind_direction_10m,
    fromCompass: compass(current.wind_direction_10m), observedAt: current.time,
    hourly: (data.hourly?.time || []).map((time, i) => ({ time, speedKmh: Math.round(data.hourly.wind_speed_10m[i]), fromDeg: data.hourly.wind_direction_10m[i] })),
    source: 'open_meteo_weather_model' };
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

async function saveCached(key, payload, seconds = CACHE_SECONDS) {
  const expiresAt = Math.floor(Date.now() / 1000) + seconds;
  if (memoryCache.size > 500) memoryCache.clear();
  memoryCache.set(key, { payload, expiresAt });
  if (!TABLE) return;
  try { await ddb.send(new PutCommand({ TableName: TABLE, Item: { cacheKey: key, payload, cachedAt: new Date().toISOString(), expiresAt } })); }
  catch (error) { console.error('Cache write failed', error.name); }
}

function parseCoords(lat, lon) {
  const latitude = Number(lat), longitude = Number(lon);
  if (lat === undefined || lat === '' || lon === undefined || lon === '' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100 };
}

// Returns { payload, cache } or throws when no provider produced data.
async function getAir({ latitude, longitude }) {
  const cacheKey = `air:${CACHE_VERSION}:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
  const cached = await loadCached(cacheKey);
  if (cached) return { payload: cached, cache: 'hit' };
  const [stationResult, forecastResult, windResult] = await Promise.allSettled([fetchStations(latitude, longitude), fetchForecast(latitude, longitude), fetchWind(latitude, longitude)]);
  const stationData = stationResult.status === 'fulfilled' ? stationResult.value : { state: 'temporarily_unavailable', stations: [] };
  const forecast = forecastResult.status === 'fulfilled' ? forecastResult.value : { hourly: {}, timezone: 'UTC' };
  const hourly = forecast.hourly || {};
  const points = (hourly.time || []).map((time, index) => ({ time, pm2_5: hourly.pm2_5?.[index] ?? null, pm10: hourly.pm10?.[index] ?? null }));
  // Open-Meteo returns local times without an offset; compare in the location's own clock via utc_offset_seconds.
  const nowLocal = Date.now() + (forecast.utc_offset_seconds || 0) * 1000;
  const toMs = time => Date.parse(`${time}Z`);
  const future = points.filter(p => toMs(p.time) >= nowLocal - 30 * 60000);
  const past = points.filter(p => toMs(p.time) < nowLocal - 30 * 60000).map(p => p.pm2_5).filter(Number.isFinite);
  const modelPm = future[0]?.pm2_5 ?? null;
  const stations = flagOutliers(stationData.stations, modelPm);
  if (!stations.length && !future.length && windResult.status !== 'fulfilled') {
    const stale = await loadCached(cacheKey, true);
    if (stale) return { payload: stale, cache: 'stale' };
    throw new Error('All providers unavailable');
  }
  const estimate = makeEstimate(stations, modelPm);
  const payload = { location: { latitude, longitude, timezone: forecast.timezone || 'UTC' },
    observedAt: new Date().toISOString(), estimate, stations,
    forecast: future.slice(0, 48),
    model: { nowPm2_5: modelPm, past24hMeanPm2_5: past.length ? Math.round(past.reduce((a, b) => a + b, 0) / past.length * 10) / 10 : null },
    guidance: guidanceFor(estimate.pm2_5),
    // Current model hour for every pollutant; PM2.5 uses the same estimate as the headline number.
    pollutants: pollutantsFor({ ...Object.fromEntries(POLLUTANT_KEYS.map(key => [key, hourly[key]?.[points.indexOf(future[0])]])), pm2_5: estimate.pm2_5 }),
    wind: windResult.status === 'fulfilled' ? windResult.value : null,
    sources: { stations: stationData.state, forecast: forecastResult.status === 'fulfilled' ? 'open_meteo_cams_model' : 'temporarily_unavailable', wind: windResult.status === 'fulfilled' ? 'open_meteo_weather_model' : 'temporarily_unavailable', labels: { pm2_5: 'PM2.5 concentration' } },
    disclaimer: 'PM2.5 monitor observations and model forecasts are shown as separate sources. This is not an official CPCB National AQI; official AQI requires pollutant-specific averaging and sub-indices. This service does not provide medical advice.' };
  // A provider outage (e.g. OpenAQ rate limit) is cached briefly so it recovers quickly.
  const degraded = stationData.state === 'temporarily_unavailable' || forecastResult.status !== 'fulfilled' || windResult.status !== 'fulfilled';
  await saveCached(cacheKey, payload, degraded ? 60 : CACHE_SECONDS);
  return { payload, cache: 'miss' };
}

function parseBody(event) {
  try { return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '{}'); }
  catch { return null; }
}

export const handler = async event => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') return reply(204, {});
  const path = event.rawPath || event.path || '';
  if (path.endsWith('/health')) return reply(200, { status: 'ok', service: 'saans-api', time: new Date().toISOString(), assistant: process.env.BEDROCK_MODEL_ID ? 'bedrock' : 'rules' });

  if (path.endsWith('/ask')) {
    if (method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const body = parseBody(event);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const coords = parseCoords(body?.lat, body?.lon);
    if (!question || question.length > 300 || !coords) return reply(400, { error: 'invalid_request', message: 'Provide a question (up to 300 characters) and valid lat/lon.' });
    const profile = PROFILES.includes(body.profile) ? body.profile : 'general';
    const lang = body.lang === 'hi' ? 'hi' : 'en';
    const place = typeof body.place === 'string' ? body.place.slice(0, 60) : '';
    try {
      const { payload } = await getAir(coords);
      return reply(200, await answer(question, payload, { profile, lang, place }));
    } catch (error) {
      console.error('Ask failed', error.name);
      return reply(502, { error: 'upstream_unavailable', message: 'Live air data is temporarily unavailable. Please retry shortly.' });
    }
  }

  if (method !== 'GET' || !path.endsWith('/air')) return reply(404, { error: 'not_found' });
  const query = event.queryStringParameters || {};
  const coords = parseCoords(query.lat, query.lon);
  if (!coords) return reply(400, { error: 'invalid_coordinates', message: 'Provide lat and lon within valid WGS84 bounds.' });
  try {
    const { payload, cache } = await getAir(coords);
    return reply(200, { ...payload, cache, ...(cache === 'stale' && { warning: 'Live providers are unavailable; showing the last cached response.' }) }, cache === 'stale' ? {} : { 'cache-control': 'public, max-age=120' });
  } catch (error) {
    console.error('Air endpoint failed', error.name);
    return reply(502, { error: 'upstream_unavailable', message: 'Live air data is temporarily unavailable. Please retry shortly.' });
  }
};
