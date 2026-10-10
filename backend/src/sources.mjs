// External providers beyond OpenAQ/CAMS: weather + boundary layer, NASA FIRMS fires, ERA5 history, geocoding.
// Every upstream call goes through jsonFetch/textFetch so latency and failures land in CloudWatch metrics.
import net from 'node:net';
import { compass } from './guidance.mjs';

// Node's happy-eyeballs gives each address 250 ms; IPv4 to NASA from India is slower and IPv6 is often unreachable, so fetch fails outright.
net.setDefaultAutoSelectFamilyAttemptTimeout(2500);

const IN_LAMBDA = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

// CloudWatch Embedded Metric Format: one JSON log line becomes a metric, no SDK call or extra permission needed.
export function metric(name, value, unit = 'Count', dimensions = { Service: 'saans-api' }) {
  if (!IN_LAMBDA) return;
  console.log(JSON.stringify({ _aws: { Timestamp: Date.now(), CloudWatchMetrics: [{ Namespace: 'Saans', Dimensions: [Object.keys(dimensions)], Metrics: [{ Name: name, Unit: unit }] }] }, ...dimensions, [name]: value }));
}

async function timedFetch(url, options, provider) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout || 8000) });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return response;
  } catch (error) {
    metric('ProviderError', 1, 'Count', { Provider: provider });
    throw error;
  } finally {
    metric('ProviderLatency', Date.now() - started, 'Milliseconds', { Provider: provider });
  }
}
export const jsonFetch = async (url, options = {}, provider = 'other') => (await timedFetch(url, options, provider)).json();
const textFetch = async (url, options = {}, provider = 'other') => (await timedFetch(url, options, provider)).text();

export const haversineKm = (a, b) => {
  const rad = d => d * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Initial bearing from a to b, degrees clockwise from north.
export const bearing = (a, b) => {
  const rad = d => d * Math.PI / 180;
  const y = Math.sin(rad(b.longitude - a.longitude)) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(b.longitude - a.longitude));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// IMD ventilation index = wind speed (m/s) x mixing height (m). Below 6000 m²/s with wind under 10 km/h, pollution stays put.
export function ventilation(speedKmh, blhM) {
  if (!Number.isFinite(speedKmh) || !Number.isFinite(blhM)) return null;
  const index = Math.round(speedKmh / 3.6 * blhM);
  return { index, label: index < 6000 && speedKmh < 10 ? 'poor' : index < 6000 ? 'low' : 'good' };
}

// --- Open-Meteo forecast: wind, temperature, humidity, boundary-layer height ---------------------------------
export async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'wind_speed_10m,wind_direction_10m,boundary_layer_height,temperature_2m,precipitation', forecast_hours: '48', wind_speed_unit: 'kmh', timezone: 'auto' });
  const data = await jsonFetch(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 'open_meteo_weather');
  const current = data.current || {}, h = data.hourly || {};
  const hourly = (h.time || []).map((time, i) => ({ time, speedKmh: Math.round(h.wind_speed_10m[i]), fromDeg: h.wind_direction_10m[i],
    blhM: h.boundary_layer_height?.[i] ?? null, temperatureC: h.temperature_2m?.[i] ?? null, rainMm: h.precipitation?.[i] ?? null }));
  const speedKmh = Math.round(current.wind_speed_10m);
  const blhM = hourly[0]?.blhM ?? null; // hourly starts at the current hour; BLH is not offered as a "current" variable
  return { speedKmh, gustKmh: Math.round(current.wind_gusts_10m), fromDeg: current.wind_direction_10m, fromCompass: compass(current.wind_direction_10m),
    temperatureC: current.temperature_2m ?? null, humidity: current.relative_humidity_2m ?? null, blhM,
    ventilation: ventilation(speedKmh, blhM), observedAt: current.time,
    hourly: hourly.map(x => ({ ...x, ventilation: ventilation(x.speedKmh, x.blhM)?.index ?? null })),
    source: 'open_meteo_weather_model' };
}

// --- NASA FIRMS active fires ------------------------------------------------------------------------------
export const INDIA_BBOX = [68, 6, 98, 38]; // west,south,east,north; includes neighbouring border areas
// ponytail: rough state bounding boxes checked in order (Delhi first); Punjab's box takes in Pakistani Punjab near Lahore and
// 'Elsewhere' includes the neighbours inside INDIA_BBOX. Good enough for smoke-source counts; swap in real polygons for exact borders.
const STATE_BOXES = [
  ['Delhi', 28.4, 28.9, 76.8, 77.35],
  ['Punjab', 29.5, 32.6, 73.85, 76.95],
  ['Haryana', 27.6, 30.95, 74.45, 77.6],
  ['Uttar Pradesh', 23.85, 30.45, 77.05, 84.65]
];
export const stateOf = (lat, lon) => STATE_BOXES.find(([, s, n, w, e]) => lat >= s && lat <= n && lon >= w && lon <= e)?.[0] || 'Elsewhere';

// Returns compact points [lat, lon, frp, confidence, 'YYYY-MM-DD HHMM'] without low-confidence detections.
export function parseFiresCsv(csv) {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const cols = header.split(',');
  const at = name => cols.indexOf(name);
  const [iLat, iLon, iFrp, iConf, iDate, iTime] = ['latitude', 'longitude', 'frp', 'confidence', 'acq_date', 'acq_time'].map(at);
  if (iLat < 0 || iLon < 0) throw new Error('Unexpected FIRMS response');
  return rows.map(row => row.split(',')).filter(r => r[iConf] !== 'l' && r[iConf] !== 'low')
    .map(r => [Number(r[iLat]), Number(r[iLon]), Number(r[iFrp]) || 0, r[iConf], `${r[iDate]} ${String(r[iTime]).padStart(4, '0')}`])
    .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function summariseFires(points) {
  const byState = {};
  for (const [lat, lon, frp] of points) {
    const s = byState[stateOf(lat, lon)] ||= { count: 0, frp: 0 };
    s.count++; s.frp += frp;
  }
  return Object.entries(byState).map(([state, v]) => ({ state, count: v.count, frp: Math.round(v.frp) })).sort((a, b) => b.count - a.count);
}

// Keeps points detected within the last `days` × 24 h (FIRMS times are UTC).
export const recentFires = (points, days, now = Date.now()) =>
  points.filter(p => Date.parse(`${p[4].slice(0, 10)}T${p[4].slice(11, 13)}:${p[4].slice(13, 15)}:00Z`) >= now - days * 864e5);

// ponytail: one satellite (NOAA-20, the most current); merge NOAA-21/S-NPP passes if coverage gaps matter, de-duplicating nearby detections.
export async function fetchFires(mapKey, days, now = Date.now()) {
  // FIRMS works in whole UTC days (range 1..5 from a start DATE; 1 day = today only, empty until today's passes land),
  // so cover days + 1 calendar days in ≤5-day chunks and trim to a rolling window.
  const base = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/VIIRS_NOAA20_NRT/${INDIA_BBOX.join(',')}`;
  const urls = [];
  for (let offset = 0; offset <= days; offset += 5) {
    urls.push(`${base}/${Math.min(5, days + 1 - offset)}/${new Date(now - (days - offset) * 864e5).toISOString().slice(0, 10)}`);
  }
  const csvs = await Promise.all(urls.map(url => textFetch(url, { timeout: 15000 }, 'nasa_firms')));
  if (csvs.some(csv => !csv.startsWith('latitude'))) throw new Error('FIRMS rejected the request'); // invalid key / rate limit come back as plain text
  return recentFires(csvs.flatMap(csv => parseFiresCsv(csv)), days, now);
}

// ponytail: surface wind direction as the smoke path; a real trajectory model (HYSPLIT) would follow winds aloft over days.
export function upwindFires(points, here, fromDeg, { rangeKm = 500, halfAngle = 35, nearKm = 50 } = {}) {
  let count = 0, frp = 0, nearest = null, near = 0;
  const states = {};
  for (const [latitude, longitude, power] of points) {
    const p = { latitude, longitude };
    const km = haversineKm(here, p);
    if (km <= nearKm) near++;
    if (km > rangeKm || !Number.isFinite(fromDeg)) continue;
    const off = Math.abs(((bearing(here, p) - fromDeg + 540) % 360) - 180);
    if (off > halfAngle) continue;
    count++; frp += power;
    nearest = nearest == null ? km : Math.min(nearest, km);
    const s = stateOf(latitude, longitude);
    states[s] = (states[s] || 0) + 1;
  }
  return { count, frp: Math.round(frp), nearestKm: nearest == null ? null : Math.round(nearest), nearbyCount: near, rangeKm, halfAngle,
    topStates: Object.entries(states).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([state, n]) => ({ state, count: n })) };
}

// --- ERA5 history + CAMS PM2.5 for backtests ---------------------------------------------------------------
const dayKey = time => time.slice(0, 10);
const mean = xs => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const max = xs => { const v = xs.filter(Number.isFinite); return v.length ? Math.max(...v) : null; };
const round = (x, d = 1) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;

export function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 5) return null;
  const mx = mean(pairs.map(p => p[0])), my = mean(pairs.map(p => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? round(sxy / Math.sqrt(sxx * syy), 2) : null;
}

export async function fetchHistory(latitude, longitude, days) {
  const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const coords = { latitude: String(latitude), longitude: String(longitude), timezone: 'auto' };
  const [weather, air] = await Promise.all([
    jsonFetch(`https://archive-api.open-meteo.com/v1/archive?${new URLSearchParams({ ...coords, start_date: start, end_date: end,
      daily: 'temperature_2m_mean,relative_humidity_2m_mean,wind_speed_10m_mean,precipitation_sum', hourly: 'boundary_layer_height,wind_speed_10m', wind_speed_unit: 'kmh' })}`, { timeout: 12000 }, 'open_meteo_era5'),
    jsonFetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${new URLSearchParams({ ...coords, hourly: 'pm2_5', past_days: String(Math.min(days, 92)), forecast_days: '1' })}`, { timeout: 12000 }, 'open_meteo_cams_history')
  ]);
  const group = (times, values) => {
    const out = {};
    (times || []).forEach((t, i) => (out[dayKey(t)] ||= []).push(values[i]));
    return out;
  };
  const wh = weather.hourly || {};
  const blhByDay = group(wh.time, wh.boundary_layer_height);
  const viByDay = group(wh.time, (wh.time || []).map((_, i) => ventilation(wh.wind_speed_10m[i], wh.boundary_layer_height[i])?.index ?? null));
  const pmByDay = group(air.hourly?.time, air.hourly?.pm2_5 || []);
  const d = weather.daily || {};
  const rows = (d.time || []).map((date, i) => ({ date, pm2_5: round(mean(pmByDay[date] || [])), temperatureC: round(d.temperature_2m_mean[i]),
    humidity: round(d.relative_humidity_2m_mean[i], 0), windKmh: round(d.wind_speed_10m_mean[i]), precipitationMm: round(d.precipitation_sum[i]),
    // Afternoon peak, as IMD reports it; night-time inversions would make every daily mean look stagnant.
    blhM: round(max(blhByDay[date] || []), 0), ventilation: round(max(viByDay[date] || []), 0) }));
  return { location: { latitude, longitude, timezone: weather.timezone || 'UTC' }, start, end, rows, backtest: backtest(rows),
    sources: { weather: 'open_meteo_era5_archive', pm2_5: 'open_meteo_cams_model' },
    note: 'Daily means; boundary layer and ventilation are the daily peak. Weather is ERA5 reanalysis (most recent days may be preliminary); PM2.5 is the CAMS model, not monitor data.' };
}

// Does stagnant air line up with dirtier days at this place? Simple split + correlation, not a causal model.
export function backtest(rows) {
  const usable = rows.filter(r => Number.isFinite(r.pm2_5) && Number.isFinite(r.ventilation));
  const poor = usable.filter(r => r.ventilation < 6000), good = usable.filter(r => r.ventilation >= 6000);
  return { days: usable.length, poorVentilationDays: poor.length, meanPm2_5PoorVentilation: round(mean(poor.map(r => r.pm2_5))),
    meanPm2_5GoodVentilation: round(mean(good.map(r => r.pm2_5))), correlationVentilationPm2_5: pearson(usable.map(r => r.ventilation), usable.map(r => r.pm2_5)) };
}

export const historyCsv = history => ['date,pm2_5_ugm3,temperature_c,humidity_pct,wind_kmh,precipitation_mm,boundary_layer_max_m,ventilation_max_m2s',
  ...history.rows.map(r => [r.date, r.pm2_5, r.temperatureC, r.humidity, r.windKmh, r.precipitationMm, r.blhM, r.ventilation].map(v => v ?? '').join(','))].join('\n') + '\n';

// --- Open-Meteo geocoding (India only) ----------------------------------------------------------------------
export function parseGeocode(data) {
  return (data.results || []).map(r => ({ name: r.name, district: r.admin2 || null, state: r.admin1 || null, latitude: r.latitude, longitude: r.longitude,
    label: [r.name, r.admin2 !== r.name ? r.admin2 : null, r.admin1].filter(Boolean).join(', ') }));
}

export async function geocode(query) {
  const params = new URLSearchParams({ name: query, count: '8', countryCode: 'IN', language: 'en', format: 'json' });
  return parseGeocode(await jsonFetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {}, 'open_meteo_geocoding'));
}
