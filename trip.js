// Trip planner: compare driving routes by haze (CAMS PM2.5 + model visibility) and pick the cleanest time to leave.
// Loaded before app.js; uses its globals (API_BASE, selectedLocation, baseMap, maps, refreshMaps, bandOf, chartTip, formatTime, safeText, langKey) at render time.

const TRIP_UI = {
  en: { from: 'From', to: 'To', go: 'Compare routes', here: 'My place', search: 'Search a place…', loading: 'Checking haze along each route…', fail: 'Could not plan this trip right now. Please try again.',
    pick: 'Pick where you are going. Saans checks the haze, smog and visibility along each driving route and the best time to leave.',
    route: id => `Route ${id}`, best: 'Least smoke breathed', now: 'If you leave now', avg: 'Avg PM2.5', max: 'Worst stretch', vis: 'Lowest visibility', hazy: 'Hazy stretch', fires: n => `${n} fire${n === 1 ? '' : 's'} within 10 km`,
    leave: 'When to leave', leaveBody: (route, time, pm, now) => `On route ${route}, leaving at ${time} means ~${pm} µg/m³ on average instead of ${now} now.`, leaveSame: route => `On route ${route}, haze stays about the same through the day: leave when it suits you.`,
    chartLabel: 'Average PM2.5 on the trip by departure hour', noRoute: 'No driving route found between these places.', km: 'km', min: 'min', h: 'h' },
  hi: { from: 'कहाँ से', to: 'कहाँ तक', go: 'रास्तों की तुलना करें', here: 'मेरी जगह', search: 'जगह खोजें…', loading: 'हर रास्ते पर धुंध जाँच रहे हैं…', fail: 'अभी यह यात्रा नहीं बन पाई। फिर कोशिश करें।',
    pick: 'बताएँ कि आप कहाँ जा रहे हैं। Saans हर रास्ते पर धुंध, स्मॉग और दृश्यता, और निकलने का सबसे अच्छा समय जाँचता है।',
    route: id => `रास्ता ${id}`, best: 'सबसे कम धुआँ', now: 'अभी निकलें तो', avg: 'औसत PM2.5', max: 'सबसे ख़राब हिस्सा', vis: 'सबसे कम दृश्यता', hazy: 'धुंध वाला हिस्सा', fires: n => `10 km के भीतर ${n} आग`,
    leave: 'कब निकलें', leaveBody: (route, time, pm, now) => `रास्ता ${route} पर ${time} बजे निकलने से औसत ~${pm} µg/m³ रहेगा, अभी ${now} की जगह।`, leaveSame: route => `रास्ता ${route} पर दिन भर धुंध लगभग एक जैसी रहेगी: जब सुविधा हो तब निकलें।`,
    chartLabel: 'निकलने के समय के अनुसार यात्रा का औसत PM2.5', noRoute: 'इन जगहों के बीच सड़क का रास्ता नहीं मिला।', km: 'km', min: 'मिनट', h: 'घंटे' }
};
const ROUTE_COLORS = { A: '#4e8676', B: '#c8794b', C: '#6b7fb0' };
const trip = { from: null, to: null, data: null, active: null, loading: false, error: '' };

const tripDuration = (m, t) => m >= 60 ? `${Math.floor(m / 60)} ${t.h} ${m % 60} ${t.min}` : `${m} ${t.min}`;

function renderTrip() {
  const root = document.querySelector('.trip-root');
  if (!root) return;
  const t = TRIP_UI[langKey()];
  trip.from ||= { name: selectedLocation.name, latitude: selectedLocation.latitude, longitude: selectedLocation.longitude };
  if (!root.querySelector('.trip-stage')) {
    root.innerHTML = `<div class="trip-stage"><div class="trip-map"></div><div class="trip-panel glass"><form class="trip-form" autocomplete="off">
      ${['from', 'to'].map(k => `<label class="trip-field"><span>${t[k]}</span><input type="search" data-end="${k}" maxlength="60" placeholder="${t.search}"/><div class="trip-results" data-for="${k}" hidden></div></label>`).join('')}
      <div class="trip-actions"><button type="button" class="text-button trip-here">⌖ ${t.here}</button><button type="submit" class="next-button trip-go">${t.go} <span>→</span></button></div></form><div class="trip-cards"></div></div></div><div class="trip-below"></div>`;
    root.querySelector('.trip-form').addEventListener('submit', event => { event.preventDefault(); planTrip(); });
    root.querySelector('.trip-here').addEventListener('click', () => { trip.from = { name: selectedLocation.name, latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }; renderTrip(); });
    root.querySelectorAll('.trip-field input').forEach(input => input.addEventListener('input', () => tripSearch(input)));
    root.addEventListener('click', event => {
      const option = event.target.closest('.trip-option');
      if (option) { const box = option.parentElement; trip[box.dataset.for] = box.places[Number(option.dataset.i)]; box.hidden = true; renderTrip(); if (trip.from && trip.to) planTrip(); }
      const card = event.target.closest('[data-route]');
      if (card) { trip.active = card.dataset.route; renderTrip(); }
    });
  }
  root.querySelectorAll('.trip-field input').forEach(input => { const end = trip[input.dataset.end]; if (end && document.activeElement !== input) input.value = end.name; });
  const cards = root.querySelector('.trip-cards'), below = root.querySelector('.trip-below');
  const d = trip.data;
  if (trip.loading) cards.innerHTML = `<p class="muted">${t.loading}</p>`;
  else if (trip.error) cards.innerHTML = `<p class="trip-error">${safeText(trip.error)}</p>`;
  else if (!d) cards.innerHTML = `<p class="muted">${t.pick}</p>`;
  else {
    const lang = langKey();
    cards.innerHTML = d.routes.map(r => {
      const band = bandOf(r.now.avgPm);
      return `<button type="button" class="route-card${r.id === trip.active ? ' on' : ''}" data-route="${r.id}" style="--c:${ROUTE_COLORS[r.id]};--band:${band[1]}">
        <span class="route-top"><b>${t.route(r.id)}</b>${r.id === d.recommended ? `<span class="route-best">★ ${t.best}</span>` : ''}<small>${r.distanceKm} ${t.km} · ${tripDuration(r.durationMin, t)}</small></span>
        <span class="route-pm"><b>${r.now.avgPm}</b><small>${t.avg} · ${band[lang === 'hi' ? 3 : 2]}</small></span>
        <span class="route-facts"><span>${t.max}: <b>${r.now.maxPm}</b> µg/m³</span>${r.now.minVisKm != null ? `<span>${t.vis}: <b>${r.now.minVisKm} km</b></span>` : ''}<span>${t.hazy}: <b>${r.now.hazyKm} ${t.km}</b></span>${r.fires ? `<span class="route-fire">🔥 ${t.fires(r.fires)}</span>` : ''}</span></button>`;
    }).join('');
  }
  below.innerHTML = d && !trip.loading ? departureHtml(d, t) : '';
  if (d && !trip.loading) {
    const route = d.routes.find(r => r.id === trip.active);
    const svg = below.querySelector('.dep-chart');
    if (svg) chartTip(svg, route.byDeparture.length, i => { const p = route.byDeparture[i]; return `<b>${formatTime(p.time)}</b>PM2.5 ${p.avgPm} µg/m³ · ${t.max.toLowerCase()} ${p.maxPm}${p.minVisKm != null ? ` · ${p.minVisKm} km` : ''}`; }, true);
  }
  drawTripMap();
}

let tripSearchTimer;
function tripSearch(input) {
  clearTimeout(tripSearchTimer);
  const box = input.parentElement.querySelector('.trip-results'), q = input.value.trim();
  if (q.length < 2 || !API_BASE) { box.hidden = true; return; }
  tripSearchTimer = setTimeout(async () => {
    try {
      const result = await fetch(`${API_BASE}/v1/geocode?q=${encodeURIComponent(q)}`);
      const places = result.ok ? (await result.json()).results : [];
      box.places = places;
      box.innerHTML = places.map((p, i) => `<button type="button" class="trip-option" data-i="${i}"><b>${safeText(p.name)}</b><small>${safeText(p.label || '')}</small></button>`).join('');
      box.hidden = !places.length;
    } catch { box.hidden = true; }
  }, 300);
}

async function planTrip() {
  const t = TRIP_UI[langKey()];
  if (!trip.from || !trip.to || !API_BASE) return;
  trip.loading = true; trip.error = ''; renderTrip();
  try {
    const q = `from=${trip.from.latitude},${trip.from.longitude}&to=${trip.to.latitude},${trip.to.longitude}`;
    const result = await fetch(`${API_BASE}/v1/route?${q}`);
    const data = await result.json();
    if (!result.ok) throw new Error(data.message || t.fail);
    if (data.state !== 'available') throw new Error(data.state === 'no_route' ? t.noRoute : t.fail);
    trip.data = data;
    trip.active = data.recommended;
    maps.trip && (maps.trip.bounds = L.latLngBounds(data.routes.flatMap(r => r.geometry)).pad(.08));
  } catch (error) { trip.data = null; trip.error = error.message || t.fail; }
  trip.loading = false;
  renderTrip();
}

// Bars: average PM2.5 on the active route for each departure hour in the next day; the best hour is outlined.
function departureHtml(d, t) {
  const route = d.routes.find(r => r.id === trip.active) || d.routes[0];
  const deps = route.byDeparture, max = Math.max(50, ...deps.map(p => p.maxPm)), bw = 720 / deps.length;
  const best = route.best;
  const advice = best && route.now.avgPm - best.avgPm >= 10 ? t.leaveBody(route.id, formatTime(best.time), best.avgPm, route.now.avgPm) : t.leaveSame(route.id);
  const bars = deps.map((p, i) => `<rect x="${(i * bw + bw * .15).toFixed(1)}" width="${(bw * .7).toFixed(1)}" y="${(150 - p.avgPm / max * 140).toFixed(1)}" height="${(p.avgPm / max * 140).toFixed(1)}" rx="2" fill="${bandOf(p.avgPm)[1]}"${p.time === best?.time ? ' class="dep-best"' : ''}/>`).join('');
  return `<article class="card dep-card"><div class="section-kicker">${t.leave.toUpperCase()}</div><h3>${t.leave} · ${t.route(route.id)}</h3><p class="dep-advice">${safeText(advice)}</p>
    <div class="dep-wrap"><svg class="dep-chart" viewBox="0 0 720 152" preserveAspectRatio="none" role="img" aria-label="${t.chartLabel}">${bars}</svg></div>
    <div class="hist-axis"><span>${formatTime(deps[0]?.time)}</span><span>${formatTime(deps[deps.length >> 1]?.time)}</span><span>${formatTime(deps.at(-1)?.time)}</span></div>
    <small class="muted">${safeText(d.note)}</small></article>`;
}

function drawTripMap() {
  if (typeof L === 'undefined') return;
  const el = document.querySelector('.trip-map');
  if (!el) return;
  const m = baseMap('trip', el);
  m.pad = () => innerWidth > 900 ? { paddingTopLeft: [440, 24], paddingBottomRight: [24, 24] } : {};
  m.layer.clearLayers();
  const d = trip.data;
  const pin = (p, label) => L.marker([p.latitude, p.longitude], { title: p.name, icon: L.divIcon({ className: '', iconSize: null, html: `<span class="trip-pin">${label}</span>` }) }).addTo(m.layer);
  if (d) {
    // Inactive routes first so the chosen one draws on top.
    [...d.routes].sort((a, b) => (a.id === trip.active) - (b.id === trip.active)).forEach(r => {
      const on = r.id === trip.active;
      L.polyline(r.geometry, { color: on ? ROUTE_COLORS[r.id] : '#8a948f', weight: on ? 6 : 4, opacity: on ? .95 : .55 })
        .on('click', () => { trip.active = r.id; renderTrip(); }).addTo(m.layer);
      if (on) r.samples.forEach(s => Number.isFinite(s.pm2_5) && L.circleMarker([s.lat, s.lon], { radius: 7, color: '#fff', weight: 2, fillColor: bandOf(s.pm2_5)[1], fillOpacity: 1 })
        .bindTooltip(`${s.km} km · PM2.5 ${Math.round(s.pm2_5)} µg/m³`).addTo(m.layer));
    });
  }
  if (trip.from) pin(trip.from, '●');
  if (trip.to) pin(trip.to, '⚑');
  if (!m.bounds && !m.fitted) { m.bounds = L.latLng(trip.from.latitude, trip.from.longitude).toBounds(30000); m.fitted = true; }
  refreshMaps();
}
