const INDIA_CITIES = [
  ['New Delhi',28.6139,77.2090],['Mumbai',19.0760,72.8777],['Kolkata',22.5726,88.3639],['Chennai',13.0827,80.2707],['Bengaluru',12.9716,77.5946],['Hyderabad',17.3850,78.4867],['Ahmedabad',23.0225,72.5714],['Pune',18.5204,73.8567],['Jaipur',26.9124,75.7873],['Lucknow',26.8467,80.9462],['Patna',25.5941,85.1376],['Bhopal',23.2599,77.4126],['Indore',22.7196,75.8577],['Chandigarh',30.7333,76.7794],['Ludhiana',30.9010,75.8573],['Amritsar',31.6340,74.8723],['Gurugram',28.4595,77.0266],['Varanasi',25.3176,82.9739],['Guwahati',26.1445,91.7362],['Bhubaneswar',20.2961,85.8245],['Nagpur',21.1458,79.0882],['Kochi',9.9312,76.2673],['Srinagar',34.0837,74.7973],['Dehradun',30.3165,78.0322]
].map(([name,latitude,longitude]) => ({name,latitude,longitude}));
const DEFAULT_LOCATION = INDIA_CITIES[0];
const API_BASE = (window.SAANS_API_BASE || '').replace(/\/$/, '');
const aqiEl = document.getElementById('aqiValue');
const rangeEl = document.getElementById('aqiRange');
const statusEl = document.querySelector('.live-pill');
const stationList = document.querySelector('.station-list');
const response = document.getElementById('chatResponse');
let selectedLocation = DEFAULT_LOCATION;
let deferredInstallPrompt;

function buildFeatureGroups() {
  const grid = document.querySelector('.dashboard-grid');
  const air = grid.querySelector('.air-card');
  const forecast = grid.querySelector('.forecast-card');
  const map = grid.querySelector('.map-card');
  const stations = grid.querySelector('.stations-card');
  const adviceCard = grid.querySelector('.advice-card');
  const assistantCard = grid.querySelector('.assistant-card');
  grid.replaceChildren();
  const airGroup = document.createElement('section');
  airGroup.className = 'feature-group airspace-group';
  airGroup.id = 'airspace';
  airGroup.innerHTML = '<div class="group-heading"><div><span class="section-kicker">YOUR NEIGHBOURHOOD</span><h2>Air around you</h2></div><p>Local readings, changing conditions and the nearby monitor network — in one place.</p></div>';
  const airGrid = document.createElement('div');
  airGrid.className = 'airspace-grid';
  const airPrimary = document.createElement('div');
  airPrimary.className = 'air-primary';
  airPrimary.append(air, forecast);
  const airSecondary = document.createElement('div');
  airSecondary.className = 'air-secondary';
  airSecondary.append(map, stations);
  airGrid.append(airPrimary, airSecondary);
  airGroup.append(airGrid);

  const guidanceGroup = document.createElement('section');
  guidanceGroup.className = 'feature-group guidance-group';
  guidanceGroup.id = 'guidance';
  guidanceGroup.innerHTML = '<div class="group-heading"><div><span class="section-kicker">MADE FOR YOUR DAY</span><h2>Guidance that makes sense</h2></div><p>Understand the air and see carefully reviewed actions for the people in your care.</p></div>';
  const guidanceGrid = document.createElement('div');
  guidanceGrid.className = 'guidance-grid';
  const profileCard = document.createElement('article');
  profileCard.className = 'card profile-guidance-card';
  profileCard.innerHTML = '<div class="advice-head"><div class="advice-icon">♡</div><div><div class="section-kicker">YOUR PEOPLE</div><h3>Advice with your household in mind</h3></div></div><p>When reviewed guidance is connected, Saans can tailor practical steps for adults, children, older people and people with respiratory or heart conditions.</p><div class="tile-tags"><span>Family profiles</span><span>Source-linked</span></div>';
  guidanceGrid.append(adviceCard, profileCard);
  guidanceGroup.append(guidanceGrid);

  const watchGroup = document.createElement('section');
  watchGroup.className = 'feature-group watch-group';
  watchGroup.id = 'area-watch';
  watchGroup.innerHTML = '<div class="group-heading"><div><span class="section-kicker">BEYOND YOUR STREET</span><h2>Area watch</h2></div><p>See the bigger picture as wind and smoke move across the region.</p></div>';
  const smoke = document.createElement('article');
  smoke.className = 'card smoke-card';
  smoke.innerHTML = '<div class="smoke-copy"><span class="section-kicker">DELHI-NCR · REGIONAL EXAMPLE</span><h3>What could move towards Delhi?</h3><p>Explore an illustrative seasonal wind corridor from Punjab and Haryana into Delhi. It is not a forecast for other Indian cities; live wind and hotspot data are not connected.</p><span class="simulation-pill"><i></i> LOOPING SIMULATION · NOT A LIVE ALERT</span></div><svg class="smoke-map" viewBox="0 0 620 300" role="img" aria-label="Looping illustrative wind corridor from Punjab and Haryana towards Delhi"><defs><linearGradient id="smokeTrack"><stop stop-color="#d9b789" stop-opacity=".1"/><stop offset=".75" stop-color="#d39565" stop-opacity=".7"/><stop offset="1" stop-color="#6e9d84" stop-opacity=".8"/></linearGradient></defs><path d="M30 60 590 244M15 235 470 5M200 300 355 0M0 130 620 195" stroke="#fff" stroke-width="12"/><path d="M30 60 590 244M15 235 470 5M200 300 355 0M0 130 620 195" stroke="#dce7dc" stroke-dasharray="3 7" fill="none"/><path d="M82 69 C192 29 206 162 319 133 S456 125 535 209" fill="none" stroke="url(#smokeTrack)" stroke-width="15" stroke-linecap="round" opacity=".42"/><path id="appWindPathA" d="M82 69 C192 29 206 162 319 133 S456 125 535 209" fill="none" stroke="transparent"/><path id="appWindPathB" d="M50 148 C180 104 233 219 340 179 S454 176 548 237" fill="none" stroke="transparent"/><path d="M82 69 C192 29 206 162 319 133 S456 125 535 209M50 148 C180 104 233 219 340 179 S454 176 548 237" fill="none" stroke="#76a28d" stroke-width="1.5" stroke-dasharray="6 9" class="flow-dash"/><circle r="6" fill="#c6875a"><animateMotion dur="7s" repeatCount="indefinite"><mpath href="#appWindPathA"/></animateMotion></circle><circle r="4" fill="#bd7951"><animateMotion dur="9s" begin="-3s" repeatCount="indefinite"><mpath href="#appWindPathB"/></animateMotion></circle><circle cx="100" cy="67" r="27" fill="#d2ae7f" opacity=".19"/><circle cx="100" cy="67" r="5" fill="#bd8a5b"/><circle cx="245" cy="135" r="25" fill="#cfaa7b" opacity=".16"/><circle cx="245" cy="135" r="5" fill="#bd8a5b"/><circle cx="535" cy="209" r="36" fill="#78a38b" opacity=".18"/><circle cx="535" cy="209" r="8" fill="#4e806d" stroke="white" stroke-width="4"/><text x="70" y="30">PUNJAB</text><text x="215" y="91">HARYANA</text><text x="510" y="265" class="smoke-delhi">DELHI</text><text x="355" y="73" class="smoke-flow-label">PREVAILING WINDS →</text></svg>';
  watchGroup.append(smoke);

  grid.append(airGroup, guidanceGroup, watchGroup);
  const chatPanel = document.createElement('aside');
  chatPanel.className = 'chat-panel';
  chatPanel.id = 'chatPanel';
  chatPanel.hidden = true;
  chatPanel.append(assistantCard);
  document.body.append(chatPanel);
  const chatFab = document.createElement('button');
  chatFab.className = 'chat-fab';
  chatFab.id = 'chatFab';
  chatFab.setAttribute('aria-label', 'Open Saans chat');
  chatFab.innerHTML = '<svg viewBox="0 0 32 32" fill="none"><path d="M16 4 18.4 13.6 28 16l-9.6 2.4L16 28l-2.4-9.6L4 16l9.6-2.4L16 4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m26 3 .9 3.1L30 7l-3.1.9L26 11l-.9-3.1L22 7l3.1-.9L26 3Z" fill="currentColor"/></svg><span>Ask Saans</span>';
  document.body.append(chatFab);
  chatFab.addEventListener('click', () => { chatPanel.hidden = !chatPanel.hidden; chatFab.classList.toggle('chat-open', !chatPanel.hidden); });
  decorateWindScene(document.querySelector('.wind-scene'), 'windPathOne', 110, 87, 340, 268);
  decorateWindScene(smoke.querySelector('.smoke-map'), 'appWindPathA', 100, 67, 345, 254);
}

function decorateWindScene(svg, pathId, fireX, fireY, labelX, labelY) {
  if (!svg) return;
  svg.insertAdjacentHTML('beforeend', `<g class="parali-symbol" transform="translate(${fireX - 14} ${fireY - 21})"><path d="M4 33v-12m6 12V14m6 19V10m6 23V16" stroke="#b99b67" stroke-width="2" stroke-linecap="round"/><path d="M1 34h25" stroke="#9b926f" stroke-width="2" stroke-linecap="round"/><path d="M11 24c-5-6 1-8 1-13 5 4 6-1 7-5 8 9 7 15 2 19-3 3-8 3-10-1Z" fill="#d58c52" stroke="#fff8ed" stroke-width="1.5"/><path d="M16 23c-2-3 1-4 2-7 4 4 3 7 0 9-1 0-2-1-2-2Z" fill="#f1c77d"/></g><g class="haze-cloud" transform="translate(${fireX + 58} ${fireY - 34})"><path d="M1 23c0-5 4-8 9-8 2-8 13-10 18-3 6-2 12 2 12 8 5 1 7 9 2 12H9c-5 0-8-4-8-9Z" fill="#fffdf4" stroke="#c7d9cd" stroke-width="1.4"/><circle cx="16" cy="21" r="1.8" fill="#d1a576"/><circle cx="24" cy="18" r="1.4" fill="#c8976d"/><circle cx="31" cy="24" r="1.5" fill="#d1a576"/></g><g class="tracked-particle-tag" transform="translate(${labelX} ${labelY})"><path d="M-20-7 -45-33" stroke="#b77d52" stroke-width="1"/><rect width="132" height="20" rx="10" fill="#fffdf8" stroke="#e5d8c7"/><circle cx="11" cy="10" r="3.5" fill="#cc8758"/><text x="21" y="13" class="tracked-particle-label">TRACKED PM2.5 PARTICLE</text></g><circle class="tracked-particle" r="5.5" fill="#c8794b" stroke="#fff" stroke-width="2"><animateMotion dur="8s" begin="-1.5s" repeatCount="indefinite"><mpath href="#${pathId}"/></animateMotion></circle>`);
}

function setStatus(label, mode = 'warn') {
  statusEl.className = `live-pill ${mode === 'ok' ? '' : 'demo-pill'}`;
  statusEl.innerHTML = `<i></i> ${label}`;
}

function formatTime(iso, timezone) {
  try { return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(iso)); }
  catch { return new Date(iso).toLocaleTimeString(); }
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderStations(stations = []) {
  if (!stations.length) {
    stationList.innerHTML = '<div class="empty-state">No recent OpenAQ PM2.5 station readings were returned near this location. The forecast remains available from the model source.</div>';
    document.querySelector('.station-count').textContent = 'NO RECENT READINGS';
    document.querySelector('.station-foot > span').textContent = 'OpenAQ data unavailable or no nearby monitors';
    return;
  }
  stationList.innerHTML = stations.map(station => {
    const stale = station.status !== 'reporting';
    const freshness = station.ageMinutes == null ? 'age unknown' : station.ageMinutes < 60 ? `${station.ageMinutes}m ago` : `${Math.floor(station.ageMinutes / 60)}h ago`;
    return `<div class="station-row"><span class="station-status ${stale ? 'offline' : 'online'}"></span><span class="station-name"><b>${safeText(station.name)}</b><small>${station.distanceKm} km · ${safeText(freshness)} · OpenAQ</small></span><span class="station-aqi"><b>${Number(station.pm2_5).toFixed(1)}</b><small>µg/m³</small></span><span class="reliability"><small>${stale ? 'Stale' : 'Recent'}</small></span></div>`;
  }).join('');
  const recent = stations.filter(s => s.status === 'reporting').length;
  document.querySelector('.station-count').textContent = `${stations.length} STATION${stations.length === 1 ? '' : 'S'}`;
  document.querySelector('.station-foot > span').innerHTML = `<span class="status-dot"></span> ${recent} recent · ${stations.length - recent} stale`;
}

function renderCoverageMap(stations = []) {
  const map = document.querySelector('.map-view');
  const all = stations.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const maxKm = Math.max(3, ...all.map(s => s.distanceKm));
  const markers = all.map((s, index) => {
    const x = 280 + (s.longitude - selectedLocation.longitude) * 75;
    const y = 145 - (s.latitude - selectedLocation.latitude) * 75;
    const stale = s.status !== 'reporting';
    return `<g><circle cx="${Math.max(25, Math.min(535, x))}" cy="${Math.max(25, Math.min(265, y))}" r="8" fill="${stale ? '#d7a579' : '#71a58a'}" stroke="white" stroke-width="3"/><text x="${Math.max(25, Math.min(535, x)) + 12}" y="${Math.max(25, Math.min(265, y)) + 4}" font-size="9" fill="#61796c">${safeText(s.name.slice(0, 22))}</text></g>`;
  }).join('');
  map.innerHTML = `<svg viewBox="0 0 560 290" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Schematic showing OpenAQ stations around your location"><rect width="560" height="290" fill="#edf3eb"/><circle cx="280" cy="145" r="${Math.min(115, 35 + maxKm * 3)}" fill="#d8e9da" opacity=".45"/><circle cx="280" cy="145" r="${Math.min(75, 23 + maxKm * 2)}" fill="#d6e7d8" opacity=".55"/><path d="M20 54 540 221M0 187 460 0M175 290 355 0M0 256 560 78" stroke="#fff" stroke-width="13"/><path d="M20 54 540 221M0 187 460 0M175 290 355 0M0 256 560 78" stroke="#d6e2d8" stroke-width="1" stroke-dasharray="4 5"/><circle cx="280" cy="145" r="12" fill="#4d806e" stroke="white" stroke-width="4"/><text x="280" y="177" text-anchor="middle" font-size="9" fill="#507765">YOUR AREA</text>${markers}</svg><div class="map-legend"><i class="good"></i> Recent <i class="poor"></i> Stale</div><span class="map-note">SCHEMATIC · STATION COORDINATES</span>`;
}

function renderForecast(points = [], timezone = selectedLocation.timezone) {
  const usable = points.slice(0, 24).filter(point => Number.isFinite(point.pm2_5));
  if (!usable.length) return;
  const values = usable.map(p => p.pm2_5);
  const max = Math.max(50, Math.ceil(Math.max(...values) / 50) * 50);
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? 0 : index * 720 / (values.length - 1);
    const y = 130 - Math.max(0, Math.min(max, value)) / max * 120;
    return [x, y];
  });
  const line = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const path = document.querySelector('.chart-line');
  const area = document.querySelector('.chart-area');
  document.querySelector('.chart-grid').innerHTML = [1,.75,.5,.25].map(part => `<span>${Math.round(max * part)}</span>`).join('');
  path.setAttribute('d', line);
  area.setAttribute('d', `${line} L720 140 L0 140 Z`);
  document.querySelector('.chart-now b').textContent = Math.round(usable[0].pm2_5);
  const chartLabels = document.querySelector('.chart-times');
  chartLabels.innerHTML = [0, 4, 8, 12, 16, 20, 23].map(index => `<span>${formatTime(usable[Math.min(index, usable.length - 1)]?.time || Date.now(), timezone)}</span>`).join('');
  const last = usable.at(-1).pm2_5, first = usable[0].pm2_5;
  document.querySelector('.forecast-summary strong').textContent = `Modelled PM2.5 ${Math.round(first)} µg/m³ now · ${Math.round(last)} in 24 hours`;
  document.querySelector('.forecast-summary small').textContent = 'CAMS atmospheric composition forecast · hourly model output · not CPCB AQI';
}

function render(data) {
  const estimate = data.estimate || {};
  const pm25 = Number.isFinite(estimate.pm2_5) ? Number(estimate.pm2_5) : null;
  aqiEl.textContent = pm25 == null ? '—' : pm25.toFixed(1);
  document.querySelector('.aqi-label').textContent = pm25 == null ? 'PM2.5 estimate unavailable' : estimate.method === 'open_meteo_model' ? 'Modelled PM2.5 concentration' : 'Indicative PM2.5 concentration';
  const risk = document.querySelector('.risk-tag');
  risk.innerHTML = `<span></span> ${pm25 == null ? 'No current estimate' : 'PM2.5 · µg/m³'}`;
  rangeEl.textContent = estimate.range?.length === 2 ? `${estimate.range[0]} — ${estimate.range[1]} µg/m³` : 'Not enough current station data';
  document.querySelector('.aqi-range').firstChild.textContent = 'Indicative PM2.5 range ';
  document.querySelector('.air-meta > div:nth-child(1) strong').innerHTML = `<span class="pollutant-dot"></span> PM2.5 <span class="meta-value">· ${Number.isFinite(pm25) ? `${Number(pm25).toFixed(1)} µg/m³` : 'unavailable'}</span>`;
  document.querySelector('.air-meta > div:nth-child(2) strong').textContent = `${estimate.stationCount || 0} recent stations · ${data.cache === 'hit' ? 'cached' : 'updated just now'}`;
  document.querySelector('.confidence b').textContent = 'Indicative estimate';
  document.querySelector('.confidence small').textContent = estimate.method === 'open_meteo_model' ? 'Model-only · not validated' : 'Spread, not a confidence interval';
  document.querySelector('.art-caption').innerHTML = '<span class="art-wave">〰</span> LIVE PROVIDER DATA';
  document.querySelector('.section-kicker').textContent = 'LIVE SOURCES';
  renderStations(data.stations);
  renderCoverageMap(data.stations);
  renderForecast(data.forecast, data.location?.timezone);
  document.querySelector('.page-footer > span:last-child').innerHTML = `${safeText(data.disclaimer)} <i>·</i> <a href="https://docs.openaq.org/" target="_blank" rel="noreferrer">OpenAQ source ↗</a> <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo source ↗</a>`;
  setStatus(data.cache === 'stale' ? 'CACHED DATA' : 'LIVE DATA', data.cache === 'stale' ? 'warn' : 'ok');
}

async function loadAir() {
  renderStations([]);
  renderCoverageMap([]);
  document.querySelector('.local-card strong').textContent = selectedLocation.name;
  document.querySelector('.local-card div:nth-child(2) .tiny:last-child').textContent = 'India · selected area';
  document.querySelector('.location-select').innerHTML = `<span class="pin">⌖</span> ${safeText(selectedLocation.name)} <span class="chevron">⌄</span>`;
  if (!API_BASE) {
    setStatus('API NOT CONFIGURED');
    document.querySelector('.aqi-label').textContent = 'Waiting for backend URL';
    document.querySelector('.aqi-range').textContent = 'Add the API URL in frontend-config.js';
    document.querySelector('.forecast-summary strong').textContent = 'Connect the Saans API to load live forecasts.';
    stationList.innerHTML = '<div class="empty-state">Live monitor readings will appear here after the API is deployed and connected.</div>';
  document.querySelector('.assistant-prompt').textContent = 'The cited air-quality assistant is not connected. Its responses will be enabled after reviewed guidance and safe retrieval are configured.';
    document.querySelector('.assistant-online').textContent = 'NOT CONNECTED';
    response.textContent = 'The cited assistant service is not connected yet.';
    document.getElementById('chatInput').disabled = true;
    document.querySelector('#chatForm button').disabled = true;
    return;
  }
  setStatus('FETCHING AIR DATA');
  try {
    const url = `${API_BASE}/v1/air?lat=${encodeURIComponent(selectedLocation.latitude)}&lon=${encodeURIComponent(selectedLocation.longitude)}`;
    const result = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
    const data = await result.json();
    if (!result.ok) throw new Error(data.message || `API error ${result.status}`);
    render(data);
  } catch (error) {
    setStatus('DATA UNAVAILABLE');
    document.querySelector('.aqi-label').textContent = 'Could not load live data';
    document.querySelector('.aqi-range').textContent = 'Check connection and API configuration, then refresh.';
    document.querySelector('.forecast-summary strong').textContent = error.message;
    document.querySelector('.assistant-prompt').textContent = 'The cited air-quality assistant is not connected. Its responses will be enabled after reviewed guidance and safe retrieval are configured.';
    document.querySelector('.assistant-online').textContent = 'NOT CONNECTED';
  }
}

function chooseCurrentLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(position => {
    selectedLocation = { name: 'My location', latitude: position.coords.latitude, longitude: position.coords.longitude };
    document.getElementById('citySelect').value = '';
    try { localStorage.removeItem('saans-city'); } catch { /* location remains for this session */ }
    const setting = document.getElementById('settingsLocation');
    if (setting) setting.textContent = 'My location · updated';
    loadAir();
  }, () => { document.querySelector('.location-select').title = 'Location permission was not granted'; }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}
document.querySelector('.location-select').addEventListener('click', chooseCurrentLocation);

document.querySelectorAll('.suggestion').forEach(button => button.disabled = true);
document.getElementById('chatForm').addEventListener('submit', event => event.preventDefault());
document.getElementById('chatInput').placeholder = 'Assistant service is not connected yet';

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.getElementById('installBtn').classList.add('install-ready');
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) { alert('Use your browser menu to install Saans or add it to your home screen.'); return; }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

function enterSaans(name) {
  const displayName = name.trim().slice(0, 40);
  if (!displayName) return;
  try { localStorage.setItem('saans-display-name', displayName); } catch { /* name remains for this session */ }
  document.getElementById('welcomeScreen').hidden = true;
  document.getElementById('nameScreen').hidden = true;
  document.querySelector('.app-shell').hidden = false;
  document.querySelector('.mobile-nav').hidden = false;
  document.body.classList.add('in-app');
  document.querySelector('.profile-name').textContent = displayName;
  document.querySelector('.avatar').textContent = displayName.charAt(0).toUpperCase();
  document.querySelector('.welcome-sub').textContent = currentLanguage === 'hi' ? `${displayName}, आपके क्षेत्र की हवा की जानकारी यहाँ है।` : `Welcome, ${displayName}. Here is the air picture for your area.`;
  document.getElementById('settingsLocation').textContent = `${selectedLocation.name} · change location`;
  loadAir();
}

buildFeatureGroups();
document.getElementById('useCurrentLocation').addEventListener('click', chooseCurrentLocation);
const citySelect = document.getElementById('citySelect');
citySelect.innerHTML = `<option value="">Choose a city</option>${INDIA_CITIES.map(city => `<option value="${safeText(city.name)}">${safeText(city.name)}</option>`).join('')}`;
try {
  const savedCity = localStorage.getItem('saans-city');
  const match = INDIA_CITIES.find(city => city.name === savedCity);
  if (match) selectedLocation = match;
} catch { /* retain the India default */ }
citySelect.value = selectedLocation.name;
citySelect.addEventListener('change', () => {
  const city = INDIA_CITIES.find(item => item.name === citySelect.value);
  if (!city) return;
  selectedLocation = city;
  try { localStorage.setItem('saans-city', city.name); } catch { /* city remains selected for this session */ }
  document.getElementById('settingsLocation').textContent = `${city.name} · India`;
  loadAir();
});
const translations = {
  en: { welcomeTitle: 'Know the air.<br><em>Find your next breath.</em>', welcomeDesc: 'Saans brings together nearby monitors, weather and smoke movement to make the air around you easier to understand — starting with communities across India.', next: 'Next', featureTitle: 'Understand the air where you live in India.', airTile: 'See what’s in the air', watchTile: 'Follow what’s moving', guideTile: 'Make it personal', chatTile: 'Ask in your own words', airGroup: 'Air around you', guidanceGroup: 'Guidance that makes sense', watchGroup: 'Area watch', moreGroup: 'More', moreDescription: 'Set up Saans the way you like it, or find a quick guide to getting started.', settings: 'Settings', language: 'Language', location: 'Location', city: 'Indian city', reduceMotion: 'Reduce motion', howTo: 'How to use Saans', dataPrivacy: 'Data and privacy', nameTitle: 'What should we<br><em>call you?</em>', enter: 'Enter Saans' },
  hi: { welcomeTitle: 'हवा को जानें।<br><em>अपनी अगली साँस को समझें।</em>', welcomeDesc: 'Saans आसपास के मॉनिटर, मौसम और धुएँ की दिशा को जोड़ता है — भारत के शहरों और समुदायों के लिए।', next: 'आगे', featureTitle: 'भारत में अपने शहर की हवा को समझें।', airTile: 'हवा में क्या है', watchTile: 'हवा की दिशा देखें', guideTile: 'आपके परिवार के लिए', chatTile: 'अपने शब्दों में पूछें', airGroup: 'आपके आसपास की हवा', guidanceGroup: 'काम की सलाह', watchGroup: 'क्षेत्र पर नज़र', moreGroup: 'और', moreDescription: 'Saans की सेटिंग बदलें या इस्तेमाल करने का तरीका जानें।', settings: 'सेटिंग', language: 'भाषा', location: 'स्थान', city: 'भारतीय शहर', reduceMotion: 'गतिशीलता कम करें', howTo: 'Saans का उपयोग कैसे करें', dataPrivacy: 'डेटा और गोपनीयता', nameTitle: 'आपको किस नाम से<br><em>बुलाएँ?</em>', enter: 'Saans खोलें' }
};
let currentLanguage = 'en';
function applyLanguage(language) {
  currentLanguage = translations[language] ? language : 'en';
  const copy = translations[currentLanguage];
  document.documentElement.lang = currentLanguage;
  document.querySelector('.welcome-hero-copy h1').innerHTML = copy.welcomeTitle;
  document.querySelector('.welcome-hero-copy>p').textContent = copy.welcomeDesc;
  document.querySelector('#nextButton').innerHTML = `${copy.next} <span>→</span>`;
  document.querySelector('.feature-overview-heading h2').textContent = copy.featureTitle;
  [copy.airTile, copy.watchTile, copy.guideTile, copy.chatTile].forEach((value, index) => { document.querySelectorAll('.feature-tile h3')[index].textContent = value; });
  [copy.airGroup, copy.guidanceGroup, copy.watchGroup, copy.moreGroup].forEach((value, index) => { const target = document.querySelectorAll('.feature-group .group-heading h2')[index]; if (target) target.textContent = value; });
  document.querySelector('.more-section .group-heading>p').textContent = copy.moreDescription;
  document.querySelector('.settings-card h3').textContent = copy.settings;
  document.querySelector('.help-card h3').textContent = copy.howTo;
  document.querySelector('.sources-card h3').textContent = copy.dataPrivacy;
  document.querySelector('label[for="languageSelect"] b').textContent = copy.language;
  document.querySelector('#useCurrentLocation b').textContent = copy.location;
  document.querySelector('label[for="citySelect"] b').textContent = copy.city;
  document.querySelector('.motion-setting b').textContent = copy.reduceMotion;
  document.querySelector('.name-card h1').innerHTML = copy.nameTitle;
  document.querySelector('.enter-button').innerHTML = `${copy.enter} <span>→</span>`;
  const sidebarLabels = currentLanguage === 'hi' ? ['मुख्य पृष्ठ', 'वायु क्षेत्र', 'सलाह', 'क्षेत्र पर नज़र', 'और'] : ['Overview', 'Airspace', 'Guidance', 'Area watch', 'More'];
  document.querySelectorAll('.side-nav .nav-item').forEach((item, index) => { const icon = item.querySelector('.nav-icon')?.outerHTML || ''; item.innerHTML = `${icon} ${sidebarLabels[index] || ''}`; });
  const mobileLabels = currentLanguage === 'hi' ? ['हवा', 'सलाह', 'क्षेत्र', 'और'] : ['Air', 'Guidance', 'Area watch', 'More'];
  document.querySelectorAll('.mobile-nav a').forEach((item, index) => { const icon = item.querySelector('span')?.outerHTML || ''; item.innerHTML = `${icon}${mobileLabels[index] || ''}`; });
}
let storedLanguage = 'en';
try { storedLanguage = localStorage.getItem('saans-language') || 'en'; } catch { /* private browsing may disable storage */ }
const languageSelect = document.getElementById('languageSelect');
languageSelect.value = storedLanguage;
applyLanguage(storedLanguage);
languageSelect.addEventListener('change', () => {
  applyLanguage(languageSelect.value);
  try { localStorage.setItem('saans-language', languageSelect.value); } catch { /* preference remains for this session */ }
});
const motionToggle = document.getElementById('reduceMotionToggle');
try { motionToggle.checked = localStorage.getItem('saans-reduce-motion') === 'true'; } catch { /* private browsing may disable storage */ }
document.body.classList.toggle('reduce-motion', motionToggle.checked);
motionToggle.addEventListener('change', () => {
  document.body.classList.toggle('reduce-motion', motionToggle.checked);
  try { localStorage.setItem('saans-reduce-motion', String(motionToggle.checked)); } catch { /* preference remains for this session */ }
});
document.getElementById('nextButton').addEventListener('click', () => {
  document.getElementById('welcomeScreen').hidden = true;
  document.getElementById('nameScreen').hidden = false;
  document.getElementById('nameInput').focus();
});
document.getElementById('backToWelcome').addEventListener('click', () => {
  document.getElementById('nameScreen').hidden = true;
  document.getElementById('welcomeScreen').hidden = false;
});
document.getElementById('nameForm').addEventListener('submit', event => {
  event.preventDefault();
  enterSaans(document.getElementById('nameInput').value);
});
let savedName = '';
try { savedName = localStorage.getItem('saans-display-name') || ''; } catch { /* private browsing may disable storage */ }
if (savedName) enterSaans(savedName);
