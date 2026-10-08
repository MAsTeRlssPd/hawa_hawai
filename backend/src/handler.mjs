import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const ssm = new SSMClient({});
const TABLE = process.env.CACHE_TABLE;
const PARAMETER_NAME = process.env.OPENAQ_PARAMETER_NAME;
const CACHE_SECONDS = 300;
const MAX_STATIONS = 8;
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
      .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_STATIONS);
    const stations = await Promise.all(locations.map(async ({ location, coords, sensors, distanceKm }) => {
      try {
        const latest = await jsonFetch(`https://api.openaq.org/v3/locations/${location.id}/latest?limit=100&page=1`, { headers: { 'X-API-Key': key } });
        const sensorIds = new Set(sensors.map(sensor => sensor.id));
        const reading = (latest.results || []).filter(item => sensorIds.has(item.sensorsId) && Number.isFinite(item.value))
          .sort((a, b) => Date.parse(b.datetime?.utc || 0) - Date.parse(a.datetime?.utc || 0))[0];
        if (!reading) return null;
        const measuredAt = reading.datetime?.utc;
        const ageMinutes = measuredAt ? Math.max(0, (Date.now() - Date.parse(measuredAt)) / 60000) : null;
        return { id: String(location.id), name: location.name || 'Unnamed monitoring location', latitude: coords.latitude, longitude: coords.longitude,
          distanceKm: Math.round(distanceKm * 10) / 10, pm2_5: reading.value, unit: sensors[0]?.parameter?.units || 'µg/m³',
          measuredAt, ageMinutes: ageMinutes == null ? null : Math.round(ageMinutes), status: ageMinutes != null && ageMinutes <= 180 ? 'reporting' : 'stale', source: 'OpenAQ' };
      } catch (error) { console.warn('Station read failed', location.id, error.name); return null; }
    }));
    return { state: 'available', stations: stations.filter(Boolean) };
  } catch (error) {
    console.warn('OpenAQ unavailable', error.name);
    return { state: 'temporarily_unavailable', stations: [] };
  }
}

async function fetchForecast(latitude, longitude) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), hourly: 'pm2_5,pm10', forecast_hours: '48', timezone: 'auto' });
  return jsonFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
}

function makeEstimate(stations, forecast) {
  const fresh = stations.filter(s => s.status === 'reporting' && s.ageMinutes <= 360 && s.pm2_5 >= 0 && s.pm2_5 <= 2000);
  const hourly = forecast.hourly || {};
  const times = hourly.time || [];
  const closest = Math.max(0, times.findIndex(time => Date.parse(time) >= Date.now() - 30 * 60000));
  const modelPm = hourly.pm2_5?.[closest] ?? null;
  if (!fresh.length) return { pm2_5: modelPm, method: 'open_meteo_model', stationCount: 0, range: modelPm == null ? null : [Math.max(0, Math.round(modelPm * .7)), Math.round(modelPm * 1.3)], note: 'Model-only PM2.5 spread; not a validated confidence interval.' };
  const weighted = fresh.map(station => ({ station, weight: 1 / Math.max(.8, station.distanceKm) ** 2 }));
  const value = weighted.reduce((sum, item) => sum + item.station.pm2_5 * item.weight, 0) / weighted.reduce((sum, item) => sum + item.weight, 0);
  const values = fresh.map(x => x.pm2_5).sort((a, b) => a - b);
  const spread = values.length > 1 ? Math.max(values.at(-1) - values[0], value * .12) : value * .25;
  return { pm2_5: Math.round(value * 10) / 10, method: 'distance_weighted_openaq', stationCount: fresh.length,
    range: [Math.max(0, Math.round(value - spread)), Math.round(value + spread)],
    note: 'Distance-weighted latest PM2.5 readings. Range is a simple spread estimate, not a validated statistical interval.' };
}

async function loadCached(key) {
  if (!TABLE) return null;
  try {
    const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { cacheKey: key }, ConsistentRead: false }));
    if (result.Item?.expiresAt > Math.floor(Date.now() / 1000)) return result.Item.payload;
  } catch (error) { console.error('Cache read failed', error.name); }
  return null;
}

async function saveCached(key, payload) {
  if (!TABLE) return;
  try { await ddb.send(new PutCommand({ TableName: TABLE, Item: { cacheKey: key, payload, cachedAt: new Date().toISOString(), expiresAt: Math.floor(Date.now() / 1000) + CACHE_SECONDS } })); }
  catch (error) { console.error('Cache write failed', error.name); }
}

export const handler = async event => {
  const method = event.requestContext?.http?.method || event.httpMethod;
  if (method === 'OPTIONS') return reply(204, {});
  const path = event.rawPath || event.path || '';
  if (path.endsWith('/health')) return reply(200, { status: 'ok', service: 'saans-api', time: new Date().toISOString() });
  if (method !== 'GET' || !path.endsWith('/air')) return reply(404, { error: 'not_found' });
  const query = event.queryStringParameters || {};
  const latitude = Number(query.lat), longitude = Number(query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return reply(400, { error: 'invalid_coordinates', message: 'Provide lat and lon within valid WGS84 bounds.' });
  const roundedLat = Math.round(latitude * 100) / 100, roundedLon = Math.round(longitude * 100) / 100;
  const cacheKey = `air:${roundedLat.toFixed(2)}:${roundedLon.toFixed(2)}`;
  const cached = await loadCached(cacheKey);
  if (cached) return reply(200, { ...cached, cache: 'hit' }, { 'cache-control': 'public, max-age=120' });
  try {
    const [stationPromise, forecastPromise] = await Promise.allSettled([fetchStations(roundedLat, roundedLon), fetchForecast(roundedLat, roundedLon)]);
    const stationResult = stationPromise.status === 'fulfilled' ? stationPromise.value : { state: 'temporarily_unavailable', stations: [] };
    const forecast = forecastPromise.status === 'fulfilled' ? forecastPromise.value : { hourly: {}, timezone: 'UTC' };
    const estimate = makeEstimate(stationResult.stations, forecast);
    const payload = { location: { latitude: roundedLat, longitude: roundedLon, timezone: forecast.timezone || 'UTC' },
      observedAt: new Date().toISOString(), estimate, stations: stationResult.stations,
      forecast: (forecast.hourly?.time || []).map((time, index) => ({ time, pm2_5: forecast.hourly.pm2_5?.[index] ?? null, pm10: forecast.hourly.pm10?.[index] ?? null })),
      sources: { stations: stationResult.state, forecast: forecastPromise.status === 'fulfilled' ? 'open_meteo_cams_model' : 'temporarily_unavailable', labels: { pm2_5: 'PM2.5 concentration' } },
      disclaimer: 'PM2.5 monitor observations and model forecasts are shown as separate sources. This is not an official CPCB National AQI; official AQI requires pollutant-specific averaging and sub-indices. This service does not provide medical advice.' };
    await saveCached(cacheKey, payload);
    return reply(200, { ...payload, cache: 'miss' }, { 'cache-control': 'public, max-age=120' });
  } catch (error) {
    console.error('Air endpoint failed', error.name);
    const stale = await loadCached(cacheKey);
    if (stale) return reply(200, { ...stale, cache: 'stale', warning: 'Live providers are unavailable; showing the last cached response.' });
    return reply(502, { error: 'upstream_unavailable', message: 'Live air data is temporarily unavailable. Please retry shortly.' });
  }
};
