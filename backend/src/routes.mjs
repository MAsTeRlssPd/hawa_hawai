// Trip haze planner: OSRM driving alternatives, sampled every few km and scored on the CAMS PM2.5 forecast
// and model visibility for every departure hour in the next day. Upwind-agnostic fire counts come from NASA FIRMS.
import { jsonFetch, haversineKm } from './sources.mjs';

const ll = (lat, lon) => ({ latitude: lat, longitude: lon });
export const MAX_TRIP_KM = 1500;

// Evenly spaced points by distance along a [lon, lat] polyline (OSRM order), with the km mark of each.
export function samplePath(coords, count) {
  if (coords.length < 2) return [{ lat: coords[0][1], lon: coords[0][0], km: 0 }];
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineKm(ll(coords[i - 1][1], coords[i - 1][0]), ll(coords[i][1], coords[i][0])));
  const total = cum.at(-1), out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const d = count === 1 ? 0 : total * k / (count - 1);
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const f = Math.min(1, Math.max(0, (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1)));
    out.push({ lat: coords[j][1] + (coords[j + 1][1] - coords[j][1]) * f, lon: coords[j][0] + (coords[j + 1][0] - coords[j][0]) * f, km: d });
  }
  return out;
}

// Open-Meteo answers several coordinates in one call (an array); a single coordinate comes back as an object.
async function multiPoint(base, points, hourly, provider) {
  const params = new URLSearchParams({ latitude: points.map(p => p.lat).join(','), longitude: points.map(p => p.lon).join(','), hourly, past_hours: '1', forecast_hours: '48', timezone: 'auto' });
  const data = await jsonFetch(`${base}?${params}`, { timeout: 10000 }, provider);
  return Array.isArray(data) ? data : [data];
}

// First hourly index at or after "now" in the location's own clock.
const nowIndex = loc => {
  const now = Date.now() + (loc.utc_offset_seconds || 0) * 1000;
  const i = (loc.hourly?.time || []).findIndex(t => Date.parse(`${t}Z`) >= now - 30 * 60000);
  return Math.max(0, i);
};

// samples: [{ km, minute, pm: [hourly from now], vis: [hourly from now] }]; returns scores for leaving `depart` hours from now.
export function scoreTrip(samples, depart, segmentKm) {
  const at = s => Math.min(s.pm.length - 1, depart + Math.floor(s.minute / 60));
  const pms = samples.map(s => s.pm[at(s)]).filter(Number.isFinite);
  const vis = samples.map(s => s.vis[Math.min(s.vis.length - 1, depart + Math.floor(s.minute / 60))]).filter(Number.isFinite);
  if (!pms.length) return null;
  const hazy = samples.filter(s => s.pm[at(s)] > 90 || s.vis[at(s)] < 2000).length;
  return { avgPm: Math.round(pms.reduce((a, b) => a + b, 0) / pms.length), maxPm: Math.round(Math.max(...pms)),
    minVisKm: vis.length ? Math.round(Math.min(...vis) / 100) / 10 : null, hazyKm: Math.round(hazy * segmentKm) };
}

// Fires within `km` of any point on the path (bbox prefilter, then great-circle distance).
export function firesNear(path, points, km = 10) {
  if (!points?.length) return 0;
  const pad = km / 100;
  const lats = path.map(p => p.lat), lons = path.map(p => p.lon);
  const box = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lons) - pad, Math.max(...lons) + pad];
  return points.filter(([lat, lon]) => lat >= box[0] && lat <= box[1] && lon >= box[2] && lon <= box[3]
    && path.some(p => Math.abs(p.lat - lat) < pad && Math.abs(p.lon - lon) < pad && haversineKm(ll(p.lat, p.lon), ll(lat, lon)) <= km)).length;
}

// from/to: { latitude, longitude }. firePoints: FIRMS [lat, lon, frp, conf, time] or null.
export async function planTrip(from, to, firePoints = null) {
  const osrm = await jsonFetch(`https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?alternatives=3&overview=full&geometries=geojson`,
    { timeout: 10000, headers: { 'user-agent': 'saans-air-app' } }, 'osrm');
  if (osrm.code !== 'Ok' || !osrm.routes?.length) throw new Error(`OSRM ${osrm.code}`);
  const routes = osrm.routes.slice(0, 3).map((r, i) => {
    const distanceKm = r.distance / 1000, durationMin = r.duration / 60;
    const count = Math.min(12, Math.max(3, Math.round(distanceKm / 5) + 1));
    const samples = samplePath(r.geometry.coordinates, count).map(p => ({ ...p, minute: distanceKm ? p.km / distanceKm * durationMin : 0 }));
    const step = Math.max(1, Math.ceil(r.geometry.coordinates.length / 300));
    const geometry = r.geometry.coordinates.filter((_, k) => k % step === 0 || k === r.geometry.coordinates.length - 1).map(([lon, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]);
    return { id: 'ABC'[i], distanceKm: Math.round(distanceKm * 10) / 10, durationMin: Math.round(durationMin), samples, geometry,
      fires: firesNear(samplePath(r.geometry.coordinates, Math.min(400, Math.max(2, Math.ceil(distanceKm / 2)))), firePoints) };
  });
  // CAMS is ~0.4° and weather ~0.1°, so nearby samples share one grid cell: query each 0.1° cell once.
  const cell = p => `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
  const cells = [...new Map(routes.flatMap(r => r.samples).map(p => [cell(p), { lat: +p.lat.toFixed(1), lon: +p.lon.toFixed(1) }])).entries()].slice(0, 40);
  const [air, wx] = await Promise.all([
    multiPoint('https://air-quality-api.open-meteo.com/v1/air-quality', cells.map(c => c[1]), 'pm2_5', 'open_meteo_cams'),
    multiPoint('https://api.open-meteo.com/v1/forecast', cells.map(c => c[1]), 'visibility', 'open_meteo_weather').catch(() => [])]);
  const series = new Map(cells.map(([key], i) => {
    const a = air[i], w = wx[i];
    return [key, { pm: (a?.hourly?.pm2_5 || []).slice(a ? nowIndex(a) : 0), vis: (w?.hourly?.visibility || []).slice(w ? nowIndex(w) : 0), times: (a?.hourly?.time || []).slice(a ? nowIndex(a) : 0) }];
  }));
  const times = series.values().next().value?.times || [];
  const scored = routes.map(r => {
    const samples = r.samples.map(s => ({ ...s, ...series.get(cell(s)) })).filter(s => s.pm?.length);
    const segmentKm = r.distanceKm / Math.max(1, samples.length);
    const byDeparture = Array.from({ length: 24 }, (_, h) => ({ time: times[h] || null, ...scoreTrip(samples, h, segmentKm) })).filter(d => d.avgPm != null);
    const now = byDeparture[0] || null;
    const best = byDeparture.reduce((a, b) => !a || b.avgPm < a.avgPm ? b : a, null);
    return { id: r.id, distanceKm: r.distanceKm, durationMin: r.durationMin, fires: r.fires, geometry: r.geometry, now, best, byDeparture,
      samples: samples.map(s => ({ lat: Math.round(s.lat * 1e4) / 1e4, lon: Math.round(s.lon * 1e4) / 1e4, km: Math.round(s.km), pm2_5: s.pm[Math.min(s.pm.length - 1, Math.floor(s.minute / 60))] ?? null })) };
  }).filter(r => r.now);
  if (!scored.length) throw new Error('No forecast along the routes');
  // Least PM2.5 breathed on the trip: average concentration × time on the road.
  const dose = r => r.now.avgPm * r.durationMin;
  const pick = scored.reduce((a, b) => dose(b) < dose(a) ? b : a);
  return { state: 'available', generatedAt: new Date().toISOString(), routes: scored, recommended: pick.id,
    note: 'Routes from OSRM (OpenStreetMap). PM2.5 is the CAMS forecast (~40 km grid) and visibility is the weather model, sampled every few km: good for comparing regional haze between routes, not street by street.' };
}
