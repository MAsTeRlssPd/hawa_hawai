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
// Personas must match PROFILES in backend/src/guidance.mjs.
const PERSONAS = {
  general: { icon: '🏢', en: ['Office / indoor', 'Mostly indoors, short trips outside'], hi: ['दफ़्तर / घर के अंदर', 'ज़्यादातर अंदर, बाहर थोड़ी देर'] },
  outdoor_worker: { icon: '👷', en: ['Construction / outdoor worker', 'Long hours outside, heavy work, dust'], hi: ['निर्माण / बाहरी कामगार', 'बाहर लंबे घंटे, भारी काम, धूल'] },
  commuter: { icon: '🛵', en: ['Delivery rider / commuter', 'Hours on the road in traffic'], hi: ['डिलीवरी राइडर / रोज़ाना सफ़र', 'ट्रैफ़िक में सड़क पर घंटों'] },
  athlete: { icon: '🏃', en: ['Runner / outdoor exercise', 'Workouts and sport outside'], hi: ['धावक / बाहर व्यायाम', 'बाहर व्यायाम और खेल'] },
  children: { icon: '🧒', en: ['Child / parent', 'Planning for a young child'], hi: ['बच्चे / अभिभावक', 'छोटे बच्चे के लिए योजना'] },
  older: { icon: '👴', en: ['Elderly person', '65 years or older'], hi: ['बुज़ुर्ग', '65 वर्ष या अधिक'] },
  pregnant: { icon: '🤰', en: ['Pregnant', 'Expecting a baby'], hi: ['गर्भवती', 'गर्भावस्था के दौरान'] },
  heart_lung: { icon: '❤️', en: ['Heart or lung condition', 'Asthma, COPD, heart disease'], hi: ['हृदय या फेफड़े का रोग', 'अस्थमा, COPD, हृदय रोग'] }
};
const PERSONA_KEYS = Object.keys(PERSONAS);
const PAGE_IDS = ['today', 'overview', 'airspace', 'guidance', 'area-watch', 'more'];
let selectedLocation = DEFAULT_LOCATION;
let deferredInstallPrompt;
let lastData = null;
let currentLanguage = 'en';
let selectedProfile = 'general';
try { if (PERSONA_KEYS.includes(localStorage.getItem('saans-profile'))) selectedProfile = localStorage.getItem('saans-profile'); } catch { /* default persona */ }

// Strings for the live (data-driven) parts of the app.
const UI = {
  en: { bandSuffix: 'CPCB PM2.5 band · indicative', guidanceKicker: 'GUIDANCE FOR TODAY', forWho: 'What to do', cpcbSays: 'CPCB health impact', cleanest: 'Cleanest hours in the next day (model)',
    profileKicker: 'YOUR PERSONA', profileTitle: 'Who are you planning for?', profileBody: 'Saans shapes alerts, advice and answers around this person. The choice stays on this device.',
    notMedical: 'Not medical advice', noEstimate: 'Guidance appears once a PM2.5 estimate is available.',
    windKicker: 'LIVE WIND · OPEN-METEO', windTitle: 'Where your air is coming from', windFrom: dir => `Air is arriving from the ${dir}`, gusts: 'gusts', next24: 'Next 24 hours',
    ncrSmoke: 'Winds from the north-west can carry stubble smoke from Punjab and Haryana in Oct–Nov. Check hotspots before assuming smoke is the cause.', ncrClear: 'Current winds are not from the Punjab–Haryana direction.', windUnavailable: 'Live wind data is unavailable right now.',
    askPlaceholder: 'Ask about your air…', thinking: 'Thinking…', you: 'You', viaBedrock: 'Answered with Amazon Bedrock from live data + CPCB guidance', viaRules: 'Answered from live data + CPCB guidance', askFailed: 'Could not reach Saans right now. Please try again.',
    modelOnly: 'Model only · no recent station nearby', outliers: n => `${n} outlier${n === 1 ? '' : 's'} excluded`, outlierTag: 'Outlier · excluded', recent: 'Recent', stale: 'Stale', useMyLocation: '⌖ Use my location',
    headline: (band, place) => `${band} air in ${place}`, planningFor: 'Planning for', change: 'Change', forYou: label => `For you · ${label}`,
    bestTime: (from, to) => `Best time to be outside: ${from} – ${to}`, bestTimeBody: avg => `The model expects the cleanest air of the day then (~${avg} µg/m³).`,
    rising: (value, at) => `PM2.5 is expected to rise to ~${value} µg/m³ by ${at}`, risingBody: 'Finish outdoor tasks earlier if you can.',
    falling: (value, at) => `Air should improve to ~${value} µg/m³ by ${at}`, fallingBody: 'Waiting a few hours may mean cleaner air outside.',
    pollutantAlert: (name, level) => `${name} is ${level.toLowerCase()} right now`, modelNote: 'No recent monitor nearby, so this is a model estimate. Treat it as a rough guide.',
    loading: 'Loading the air around you…', seeGuidance: 'Full guidance →',
    pollutantsTitle: 'What is in your air, and how it affects you', pollutantsNote: 'Current model hour from CAMS; PM2.5 uses the Saans estimate. Levels use CPCB breakpoints and are indicative.', affectsYou: 'Affects you more',
    pages: {
      today: { kicker: 'TODAY FOR YOU', title: name => `Hi ${name}, here is your air today`, desc: 'Alerts and steps for the person you are planning for, from live data.' },
      overview: { kicker: 'YOUR NEIGHBOURHOOD', title: () => 'Overview', desc: 'The current PM2.5 estimate and the next hours from the model.' },
      airspace: { kicker: 'THE NETWORK', title: () => 'Airspace', desc: 'Nearby monitors, how fresh they are, and where they sit around you.' },
      guidance: { kicker: 'MADE FOR YOUR DAY', title: () => 'Guidance that makes sense', desc: 'CPCB health impact and practical steps for your persona.' },
      'area-watch': { kicker: 'BEYOND YOUR STREET', title: () => 'Area watch', desc: 'Live wind for your area, and how smoke can move across the region.' },
      more: { kicker: 'YOUR SAANS', title: () => 'More', desc: 'Set up Saans the way you like it, or find a quick guide to getting started.' } } },
  hi: { bandSuffix: 'CPCB PM2.5 श्रेणी · संकेतात्मक', guidanceKicker: 'आज के लिए सलाह', forWho: 'क्या करें', cpcbSays: 'CPCB के अनुसार स्वास्थ्य प्रभाव', cleanest: 'अगले 24 घंटों में सबसे साफ़ समय (मॉडल)',
    profileKicker: 'आपकी पहचान', profileTitle: 'आप किसके लिए योजना बना रहे हैं?', profileBody: 'Saans इसी व्यक्ति के अनुसार अलर्ट, सलाह और उत्तर देता है। यह चुनाव इसी डिवाइस पर रहता है।',
    notMedical: 'चिकित्सकीय सलाह नहीं', noEstimate: 'PM2.5 अनुमान मिलने पर सलाह दिखेगी।',
    windKicker: 'लाइव हवा · OPEN-METEO', windTitle: 'आपकी हवा कहाँ से आ रही है', windFrom: dir => `हवा ${dir} दिशा से आ रही है`, gusts: 'झोंके', next24: 'अगले 24 घंटे',
    ncrSmoke: 'अक्टूबर–नवंबर में उत्तर-पश्चिमी हवाएँ पंजाब और हरियाणा से पराली का धुआँ ला सकती हैं।', ncrClear: 'अभी हवा पंजाब–हरियाणा की दिशा से नहीं आ रही है।', windUnavailable: 'लाइव हवा का डेटा अभी उपलब्ध नहीं है।',
    askPlaceholder: 'अपनी हवा के बारे में पूछें…', thinking: 'सोच रहा हूँ…', you: 'आप', viaBedrock: 'Amazon Bedrock द्वारा लाइव डेटा + CPCB सलाह से उत्तर', viaRules: 'लाइव डेटा + CPCB सलाह से उत्तर', askFailed: 'अभी Saans से संपर्क नहीं हो पाया। फिर कोशिश करें।',
    modelOnly: 'केवल मॉडल · पास में हाल का स्टेशन नहीं', outliers: n => `${n} असामान्य रीडिंग हटाई गई`, outlierTag: 'असामान्य · हटाया', recent: 'हाल का', stale: 'पुराना', useMyLocation: '⌖ मेरा स्थान',
    headline: (band, place) => `${place} में हवा: ${band}`, planningFor: 'किसके लिए', change: 'बदलें', forYou: label => `आपके लिए · ${label}`,
    bestTime: (from, to) => `बाहर जाने का सबसे अच्छा समय: ${from} – ${to}`, bestTimeBody: avg => `मॉडल के अनुसार तब दिन की सबसे साफ़ हवा होगी (~${avg} µg/m³)।`,
    rising: (value, at) => `${at} तक PM2.5 बढ़कर ~${value} µg/m³ होने की संभावना है`, risingBody: 'हो सके तो बाहर के काम पहले निपटा लें।',
    falling: (value, at) => `${at} तक हवा सुधरकर ~${value} µg/m³ होनी चाहिए`, fallingBody: 'कुछ घंटे रुकने पर बाहर की हवा साफ़ मिल सकती है।',
    pollutantAlert: (name, level) => `${name} अभी ${level} स्तर पर है`, modelNote: 'पास में हाल का मॉनिटर नहीं है, इसलिए यह मॉडल अनुमान है। इसे मोटा अंदाज़ा मानें।',
    loading: 'आपके आसपास की हवा लोड हो रही है…', seeGuidance: 'पूरी सलाह →',
    pollutantsTitle: 'आपकी हवा में क्या है, और इसका आप पर असर', pollutantsNote: 'CAMS मॉडल का मौजूदा घंटा; PM2.5 Saans अनुमान है। स्तर CPCB सीमाओं पर आधारित और संकेतात्मक हैं।', affectsYou: 'आप पर ज़्यादा असर',
    pages: {
      today: { kicker: 'आज आपके लिए', title: name => `नमस्ते ${name}, आज आपकी हवा ऐसी है`, desc: 'लाइव डेटा से आपके चुने व्यक्ति के लिए अलर्ट और कदम।' },
      overview: { kicker: 'आपका इलाका', title: () => 'सारांश', desc: 'मौजूदा PM2.5 अनुमान और मॉडल के अनुसार अगले घंटे।' },
      airspace: { kicker: 'नेटवर्क', title: () => 'वायु क्षेत्र', desc: 'आसपास के मॉनिटर, उनका डेटा कितना ताज़ा है, और वे कहाँ हैं।' },
      guidance: { kicker: 'आपके दिन के लिए', title: () => 'काम की सलाह', desc: 'CPCB स्वास्थ्य प्रभाव और आपके लिए व्यावहारिक कदम।' },
      'area-watch': { kicker: 'आपकी गली से आगे', title: () => 'क्षेत्र पर नज़र', desc: 'आपके इलाके की लाइव हवा, और धुआँ कैसे फैल सकता है।' },
      more: { kicker: 'आपका SAANS', title: () => 'और', desc: 'Saans की सेटिंग बदलें या इस्तेमाल करने का तरीका जानें।' } } }
};
const ui = () => UI[currentLanguage] || UI.en;
const langKey = () => currentLanguage === 'hi' ? 'hi' : 'en';
const personaLabel = (key = selectedProfile) => PERSONAS[key][langKey()][0];
const displayName = () => document.querySelector('.profile-name').textContent;

function buildPages() {
  const grid = document.querySelector('.dashboard-grid');
  const air = grid.querySelector('.air-card');
  const forecast = grid.querySelector('.forecast-card');
  const map = grid.querySelector('.map-card');
  const stations = grid.querySelector('.stations-card');
  const adviceCard = grid.querySelector('.advice-card');
  const assistantCard = grid.querySelector('.assistant-card');
  grid.removeAttribute('id');
  grid.replaceChildren();
  const page = (id, ...children) => {
    const section = document.createElement('section');
    section.className = 'feature-group page';
    section.id = id;
    section.hidden = true;
    section.innerHTML = '<div class="group-heading"></div>';
    section.append(...children);
    return section;
  };
  const div = (className, ...children) => { const el = document.createElement('div'); el.className = className; el.append(...children); return el; };

  const today = page('today', div('today-headline'), div('briefing'), div('pollutant-section'));
  today.querySelector('.briefing').setAttribute('aria-live', 'polite');
  const profileCard = document.createElement('article');
  profileCard.className = 'card profile-guidance-card';
  const windCard = document.createElement('article');
  windCard.className = 'card wind-card';
  const smoke = document.createElement('article');
  smoke.className = 'card smoke-card';
  smoke.innerHTML = '<div class="smoke-copy"><span class="section-kicker">DELHI-NCR · REGIONAL EXAMPLE</span><h3>What could move towards Delhi?</h3><p>Explore an illustrative seasonal wind corridor from Punjab and Haryana into Delhi. It is not a forecast for other Indian cities; the live wind for your area is shown above.</p><span class="simulation-pill"><i></i> LOOPING SIMULATION · NOT A LIVE ALERT</span></div><svg class="smoke-map" viewBox="0 0 620 300" role="img" aria-label="Looping illustrative wind corridor from Punjab and Haryana towards Delhi"><defs><linearGradient id="smokeTrack"><stop stop-color="#d9b789" stop-opacity=".1"/><stop offset=".75" stop-color="#d39565" stop-opacity=".7"/><stop offset="1" stop-color="#6e9d84" stop-opacity=".8"/></linearGradient></defs><path d="M30 60 590 244M15 235 470 5M200 300 355 0M0 130 620 195" stroke="#fff" stroke-width="12"/><path d="M30 60 590 244M15 235 470 5M200 300 355 0M0 130 620 195" stroke="#dce7dc" stroke-dasharray="3 7" fill="none"/><path d="M82 69 C192 29 206 162 319 133 S456 125 535 209" fill="none" stroke="url(#smokeTrack)" stroke-width="15" stroke-linecap="round" opacity=".42"/><path id="appWindPathA" d="M82 69 C192 29 206 162 319 133 S456 125 535 209" fill="none" stroke="transparent"/><path id="appWindPathB" d="M50 148 C180 104 233 219 340 179 S454 176 548 237" fill="none" stroke="transparent"/><path d="M82 69 C192 29 206 162 319 133 S456 125 535 209M50 148 C180 104 233 219 340 179 S454 176 548 237" fill="none" stroke="#76a28d" stroke-width="1.5" stroke-dasharray="6 9" class="flow-dash"/><circle r="6" fill="#c6875a"><animateMotion dur="7s" repeatCount="indefinite"><mpath href="#appWindPathA"/></animateMotion></circle><circle r="4" fill="#bd7951"><animateMotion dur="9s" begin="-3s" repeatCount="indefinite"><mpath href="#appWindPathB"/></animateMotion></circle><circle cx="100" cy="67" r="27" fill="#d2ae7f" opacity=".19"/><circle cx="100" cy="67" r="5" fill="#bd8a5b"/><circle cx="245" cy="135" r="25" fill="#cfaa7b" opacity=".16"/><circle cx="245" cy="135" r="5" fill="#bd8a5b"/><circle cx="535" cy="209" r="36" fill="#78a38b" opacity=".18"/><circle cx="535" cy="209" r="8" fill="#4e806d" stroke="white" stroke-width="4"/><text x="70" y="30">PUNJAB</text><text x="215" y="91">HARYANA</text><text x="510" y="265" class="smoke-delhi">DELHI</text><text x="355" y="73" class="smoke-flow-label">PREVAILING WINDS →</text></svg>';

  grid.append(
    today,
    page('overview', div('air-primary', air, forecast)),
    page('airspace', div('air-secondary', map, stations)),
    page('guidance', div('guidance-grid', adviceCard, profileCard)),
    page('area-watch', windCard, smoke));
  const more = document.getElementById('more');
  more.classList.add('page');
  more.hidden = true;

  const chatPanel = document.createElement('aside');
  chatPanel.className = 'chat-panel';
  chatPanel.id = 'chatPanel';
  chatPanel.hidden = true;
  chatPanel.append(assistantCard);
  document.body.append(chatPanel);
  const chatFab = document.createElement('button');
  chatFab.className = 'chat-fab';
  chatFab.id = 'chatFab';
  chatFab.hidden = true;
  chatFab.setAttribute('aria-label', 'Open Saans chat');
  chatFab.innerHTML = '<svg viewBox="0 0 32 32" fill="none"><path d="M16 4 18.4 13.6 28 16l-9.6 2.4L16 28l-2.4-9.6L4 16l9.6-2.4L16 4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m26 3 .9 3.1L30 7l-3.1.9L26 11l-.9-3.1L22 7l3.1-.9L26 3Z" fill="currentColor"/></svg><span>Ask Saans</span>';
  document.body.append(chatFab);
  chatFab.addEventListener('click', () => {
    chatPanel.hidden = !chatPanel.hidden;
    chatFab.classList.toggle('chat-open', !chatPanel.hidden);
    if (!chatPanel.hidden) document.getElementById('chatInput').focus();
  });
  decorateWindScene(document.querySelector('.wind-scene'), 'windPathOne', 110, 87, 340, 268);
  decorateWindScene(smoke.querySelector('.smoke-map'), 'appWindPathA', 100, 67, 345, 254);
}

function renderHeadings() {
  const pages = ui().pages;
  PAGE_IDS.forEach(id => {
    const copy = pages[id];
    document.querySelector(`#${id} > .group-heading`).innerHTML = `<div><span class="section-kicker">${copy.kicker}</span><h2>${safeText(copy.title(displayName()))}</h2></div><p>${copy.desc}</p>`;
  });
  const labels = currentLanguage === 'hi' ? ['आज', 'सारांश', 'वायु क्षेत्र', 'सलाह', 'क्षेत्र पर नज़र', 'और'] : ['Today', 'Overview', 'Airspace', 'Guidance', 'Area watch', 'More'];
  document.querySelectorAll('.side-nav .nav-item').forEach((item, index) => { const icon = item.querySelector('.nav-icon')?.outerHTML || ''; item.innerHTML = `${icon} ${safeText(labels[index])}`; });
  const mobile = currentLanguage === 'hi' ? ['आज', 'सारांश', 'वायु', 'सलाह', 'क्षेत्र', 'और'] : ['Today', 'Overview', 'Airspace', 'Guidance', 'Area', 'More'];
  document.querySelectorAll('.mobile-nav a').forEach((item, index) => { const icon = item.querySelector('span')?.outerHTML || ''; item.innerHTML = `${icon}${mobile[index]}`; });
  showPage(location.hash.slice(1), false);
}

// One page at a time; the URL hash is the router so links, back button and refresh all work.
function showPage(id, scroll = true) {
  if (!PAGE_IDS.includes(id)) id = 'today';
  PAGE_IDS.forEach(pageId => { document.getElementById(pageId).hidden = pageId !== id; });
  document.querySelectorAll('.side-nav .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('href') === `#${id}`));
  document.querySelectorAll('.mobile-nav a').forEach(item => item.classList.toggle('mobile-active', item.getAttribute('href') === `#${id}`));
  const label = document.querySelector(`.side-nav .nav-item[href="#${id}"]`)?.lastChild.textContent.trim();
  document.querySelector('.breadcrumb strong').textContent = label || '';
  if (scroll) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));

function decorateWindScene(svg, pathId, fireX, fireY, labelX, labelY) {
  if (!svg) return;
  svg.insertAdjacentHTML('beforeend', `<g class="parali-symbol" transform="translate(${fireX - 14} ${fireY - 21})"><path d="M4 33v-12m6 12V14m6 19V10m6 23V16" stroke="#b99b67" stroke-width="2" stroke-linecap="round"/><path d="M1 34h25" stroke="#9b926f" stroke-width="2" stroke-linecap="round"/><path d="M11 24c-5-6 1-8 1-13 5 4 6-1 7-5 8 9 7 15 2 19-3 3-8 3-10-1Z" fill="#d58c52" stroke="#fff8ed" stroke-width="1.5"/><path d="M16 23c-2-3 1-4 2-7 4 4 3 7 0 9-1 0-2-1-2-2Z" fill="#f1c77d"/></g><g class="haze-cloud" transform="translate(${fireX + 58} ${fireY - 34})"><path d="M1 23c0-5 4-8 9-8 2-8 13-10 18-3 6-2 12 2 12 8 5 1 7 9 2 12H9c-5 0-8-4-8-9Z" fill="#fffdf4" stroke="#c7d9cd" stroke-width="1.4"/><circle cx="16" cy="21" r="1.8" fill="#d1a576"/><circle cx="24" cy="18" r="1.4" fill="#c8976d"/><circle cx="31" cy="24" r="1.5" fill="#d1a576"/></g><g class="tracked-particle-tag" transform="translate(${labelX} ${labelY})"><path d="M-20-7 -45-33" stroke="#b77d52" stroke-width="1"/><rect width="132" height="20" rx="10" fill="#fffdf8" stroke="#e5d8c7"/><circle cx="11" cy="10" r="3.5" fill="#cc8758"/><text x="21" y="13" class="tracked-particle-label">TRACKED PM2.5 PARTICLE</text></g><circle class="tracked-particle" r="5.5" fill="#c8794b" stroke="#fff" stroke-width="2"><animateMotion dur="8s" begin="-1.5s" repeatCount="indefinite"><mpath href="#${pathId}"/></animateMotion></circle>`);
}

function setStatus(label, mode = 'warn') {
  statusEl.className = `live-pill ${mode === 'ok' ? '' : 'demo-pill'}`;
  statusEl.innerHTML = `<i></i> ${label}`;
  const footer = document.querySelector('.side-footer');
  footer.innerHTML = `<span class="status-dot ${mode === 'ok' ? '' : 'warn-dot'}"></span> ${mode === 'ok' ? 'Connected to Saans API' : safeText(label.charAt(0) + label.slice(1).toLowerCase())} <span class="side-version">v1.0 beta</span>`;
}

function toast(message) {
  let el = document.getElementById('saansToast');
  if (!el) { el = document.createElement('div'); el.id = 'saansToast'; el.className = 'saans-toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el.timer);
  el.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Open-Meteo times are local wall-clock times without an offset; read and print them as-is.
function formatTime(localIso) {
  try { return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', timeZone: 'UTC' }).format(new Date(`${localIso}Z`)); }
  catch { return String(localIso).slice(11, 16); }
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function renderStations(stations = []) {
  if (!stations.length) {
    stationList.innerHTML = '<div class="empty-state">No OpenAQ PM2.5 monitors reported near this location in the past week. The forecast remains available from the model source.</div>';
    document.querySelector('.station-count').textContent = 'NO RECENT READINGS';
    document.querySelector('.station-foot > span').textContent = 'OpenAQ data unavailable or no nearby monitors';
    return;
  }
  const copy = ui();
  stationList.innerHTML = stations.map((station, index) => {
    const stale = station.status !== 'reporting';
    const freshness = station.ageMinutes < 60 ? `${station.ageMinutes}m ago` : station.ageMinutes < 2880 ? `${Math.floor(station.ageMinutes / 60)}h ago` : `${Math.floor(station.ageMinutes / 1440)}d ago`;
    const state = station.flag ? 'outlier' : stale ? 'offline' : 'online';
    const tag = station.flag ? copy.outlierTag : stale ? copy.stale : copy.recent;
    return `<div class="station-row ${state}"><span class="station-status ${state}"></span><span class="station-name"><b><span class="station-num">${index + 1}</span> ${safeText(station.name)}</b><small>${station.distanceKm} km · ${safeText(freshness)} · OpenAQ</small></span><span class="station-aqi"><b>${Number(station.pm2_5).toFixed(1)}</b><small>µg/m³</small></span><span class="reliability"><small>${tag}</small></span></div>`;
  }).join('');
  const recent = stations.filter(s => s.status === 'reporting' && !s.flag).length;
  const outliers = stations.filter(s => s.flag).length;
  document.querySelector('.station-count').textContent = `${stations.length} STATION${stations.length === 1 ? '' : 'S'}`;
  document.querySelector('.station-foot > span').innerHTML = `<span class="status-dot"></span> ${recent} recent · ${stations.length - recent - outliers} stale${outliers ? ` · ${outliers} outlier` : ''}`;
}

function renderCoverageMap(stations = []) {
  const map = document.querySelector('.map-view');
  const all = stations.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const maxKm = Math.max(2, ...all.map(s => s.distanceKm));
  const pxPerKm = 115 / maxKm;
  const kmPerLon = 111.32 * Math.cos(selectedLocation.latitude * Math.PI / 180);
  const markers = all.map((s, index) => {
    const x = Math.max(16, Math.min(544, 280 + (s.longitude - selectedLocation.longitude) * kmPerLon * pxPerKm));
    const y = Math.max(16, Math.min(274, 145 - (s.latitude - selectedLocation.latitude) * 110.57 * pxPerKm));
    const fill = s.flag ? '#c2453a' : s.status !== 'reporting' ? '#d7a579' : '#71a58a';
    return `<g><title>${safeText(s.name)} · ${s.pm2_5} µg/m³</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${fill}" stroke="white" stroke-width="2.5"/><text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${index + 1}</text></g>`;
  }).join('');
  const ringKm = maxKm >= 8 ? 5 : maxKm >= 4 ? 2 : 1;
  map.innerHTML = `<svg viewBox="0 0 560 290" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Schematic showing OpenAQ stations around your location, drawn to scale"><rect width="560" height="290" fill="#edf3eb"/><path d="M20 54 540 221M0 187 460 0M175 290 355 0M0 256 560 78" stroke="#fff" stroke-width="13"/><path d="M20 54 540 221M0 187 460 0M175 290 355 0M0 256 560 78" stroke="#d6e2d8" stroke-width="1" stroke-dasharray="4 5"/><circle cx="280" cy="145" r="${(ringKm * pxPerKm).toFixed(1)}" fill="#d6e7d8" fill-opacity=".45" stroke="#9fc2ad" stroke-dasharray="3 4"/><text x="${(280 + ringKm * pxPerKm * .71 + 4).toFixed(1)}" y="${(145 - ringKm * pxPerKm * .71 - 4).toFixed(1)}" font-size="9" fill="#5f8a74">${ringKm} km</text><circle cx="280" cy="145" r="7" fill="#4d806e" stroke="white" stroke-width="3"/><text x="280" y="168" text-anchor="middle" font-size="9" fill="#507765">YOUR AREA</text>${markers}</svg><div class="map-legend"><i class="good"></i> Recent <i class="poor"></i> Stale <i class="bad"></i> Outlier</div><span class="map-note">TO SCALE · NUMBERS MATCH THE LIST</span>`;
}

function renderForecast(points = []) {
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
  document.querySelector('.chart-grid').innerHTML = [1,.75,.5,.25].map(part => `<span>${Math.round(max * part)}</span>`).join('');
  document.querySelector('.chart-line').setAttribute('d', line);
  document.querySelector('.chart-area').setAttribute('d', `${line} L720 140 L0 140 Z`);
  document.querySelector('.chart-now b').textContent = Math.round(usable[0].pm2_5);
  document.querySelector('.chart-times').innerHTML = [0, 4, 8, 12, 16, 20, 23].map(index => `<span>${formatTime(usable[Math.min(index, usable.length - 1)].time)}</span>`).join('');
  const last = usable.at(-1).pm2_5, first = usable[0].pm2_5;
  document.querySelector('.forecast-summary strong').textContent = `Modelled PM2.5 ${Math.round(first)} µg/m³ now · ${Math.round(last)} in 24 hours`;
  document.querySelector('.forecast-summary small').textContent = 'CAMS atmospheric composition forecast · hourly model output · not CPCB AQI';
}

// Lowest-PM2.5 3-hour window between 6am and 9pm in the next 24 model hours.
function cleanestWindow(points = []) {
  const day = points.slice(0, 24).filter(p => Number.isFinite(p.pm2_5) && +p.time.slice(11, 13) >= 6 && +p.time.slice(11, 13) <= 21);
  let best = null;
  for (let i = 0; i + 2 < day.length; i++) {
    const avg = (day[i].pm2_5 + day[i + 1].pm2_5 + day[i + 2].pm2_5) / 3;
    if (!best || avg < best.avg) best = { avg, from: day[i].time, to: day[i + 2].time };
  }
  return best;
}

const personaOptions = className => PERSONA_KEYS.map(key => `<button type="button" role="radio" aria-checked="${key === selectedProfile}" data-profile="${key}" class="${className}${key === selectedProfile ? ' selected' : ''}"><span class="persona-icon" aria-hidden="true">${PERSONAS[key].icon}</span><span><b>${safeText(PERSONAS[key][langKey()][0])}</b><small>${safeText(PERSONAS[key][langKey()][1])}</small></span></button>`).join('');

function setPersona(key) {
  selectedProfile = key;
  try { localStorage.setItem('saans-profile', key); } catch { /* session only */ }
  renderPersonal();
}

function renderGuidance() {
  const card = document.querySelector('.advice-card');
  const copy = ui(), lang = langKey();
  const g = lastData?.guidance;
  if (!g) {
    card.innerHTML = `<div class="section-kicker">${copy.guidanceKicker}</div><p>${copy.noEstimate}</p>`;
  } else {
    const window = cleanestWindow(lastData.forecast);
    card.innerHTML = `<div class="advice-head"><span class="band-pill" style="--band:${g.band.color}"><i></i>${safeText(g.band.label[lang])}</span><span class="band-value">${Math.round(lastData.estimate.pm2_5)} µg/m³ · ${copy.bandSuffix}</span></div>
      <h3>${copy.forWho} · ${PERSONAS[selectedProfile].icon} ${safeText(personaLabel())}</h3>
      <ul class="advice-list">${g.actions[selectedProfile][lang].map(item => `<li>${safeText(item)}</li>`).join('')}</ul>
      ${window ? `<div class="advice-window"><span>☼</span><span><b>${formatTime(window.from)} – ${formatTime(window.to)}</b><small>${copy.cleanest} · ~${Math.round(window.avg)} µg/m³</small></span></div>` : ''}
      <blockquote class="advice-impact"><small>${copy.cpcbSays}</small>${safeText(g.band.impact[lang])}</blockquote>
      <div class="advice-source">${copy.notMedical} <span>·</span> <a href="${safeText(g.source.url)}" target="_blank" rel="noreferrer">CPCB ↗</a></div>`;
  }
  const profileCard = document.querySelector('.profile-guidance-card');
  profileCard.innerHTML = `<div class="advice-head"><div class="advice-icon">♡</div><div><div class="section-kicker">${copy.profileKicker}</div><h3>${copy.profileTitle}</h3></div></div><p>${copy.profileBody}</p><div class="profile-options" role="radiogroup" aria-label="${copy.profileTitle}">${personaOptions('profile-option')}</div>`;
  profileCard.querySelectorAll('.profile-option').forEach(button => button.addEventListener('click', () => setPersona(button.dataset.profile)));
  document.querySelector('.profile-chip')?.remove();
}

// Today page: a headline card plus notification-style alerts built from live data for the chosen persona.
function briefingItems(data) {
  const copy = ui(), lang = langKey(), g = data.guidance, items = [];
  if (!g) return [{ tone: 'info', icon: 'ℹ', title: copy.noEstimate }];
  const tone = g.band.index >= 3 ? 'warn' : g.band.index === 2 ? 'caution' : 'ok';
  g.actions[selectedProfile][lang].forEach(action => items.push({ tone, icon: PERSONAS[selectedProfile].icon, title: action, tag: copy.forYou(personaLabel()) }));
  const next = (data.forecast || []).slice(0, 7).filter(p => Number.isFinite(p.pm2_5));
  if (next.length > 2) {
    const now = data.estimate?.pm2_5 ?? next[0].pm2_5;
    const peak = next.slice(1).reduce((a, b) => b.pm2_5 > a.pm2_5 ? b : a);
    const low = next.slice(1).reduce((a, b) => b.pm2_5 < a.pm2_5 ? b : a);
    if (peak.pm2_5 > now * 1.2 && peak.pm2_5 - now > 10) items.push({ tone: 'caution', icon: '↗', title: copy.rising(Math.round(peak.pm2_5), formatTime(peak.time)), body: copy.risingBody });
    else if (low.pm2_5 < now * 0.8 && now - low.pm2_5 > 10) items.push({ tone: 'ok', icon: '↘', title: copy.falling(Math.round(low.pm2_5), formatTime(low.time)), body: copy.fallingBody });
  }
  const best = cleanestWindow(data.forecast);
  if (best) items.push({ tone: 'ok', icon: '☼', title: copy.bestTime(formatTime(best.from), formatTime(best.to)), body: copy.bestTimeBody(Math.round(best.avg)) });
  (data.pollutants || []).filter(p => p.key !== 'pm2_5' && p.level.index >= 2 && p.affects.includes(selectedProfile))
    .forEach(p => items.push({ tone: p.level.index >= 3 ? 'warn' : 'caution', icon: '⚗', title: copy.pollutantAlert(p.name, p.level.label[lang]), body: p.about[lang] }));
  const wind = data.wind;
  const inNcr = selectedLocation.latitude > 27.9 && selectedLocation.latitude < 29.3 && selectedLocation.longitude > 76.4 && selectedLocation.longitude < 77.9;
  if (inNcr && wind && wind.fromDeg >= 250 && wind.fromDeg <= 350) items.push({ tone: 'caution', icon: '⌁', title: copy.ncrSmoke });
  if (data.estimate?.method === 'open_meteo_model') items.push({ tone: 'info', icon: 'ℹ', title: copy.modelNote });
  return items;
}

function renderBriefing() {
  const copy = ui(), lang = langKey();
  const headline = document.querySelector('.today-headline');
  const feed = document.querySelector('.briefing');
  const data = lastData;
  const persona = `<button type="button" class="persona-chip" data-goto="guidance"><span aria-hidden="true">${PERSONAS[selectedProfile].icon}</span> ${copy.planningFor}: <b>${safeText(personaLabel())}</b> <u>${copy.change}</u></button>`;
  if (!data) {
    headline.innerHTML = `<div class="headline-card"><p class="headline-title">${copy.loading}</p>${persona}</div>`;
    feed.innerHTML = '';
  } else {
    const g = data.guidance, pm = data.estimate?.pm2_5;
    headline.innerHTML = `<div class="headline-card" style="--band:${g?.band.color || '#9aa'}"><div class="headline-main"><span class="headline-pm"><b>${Number.isFinite(pm) ? Math.round(pm) : '—'}</b><small>PM2.5 µg/m³</small></span><div><p class="headline-title">${g ? safeText(copy.headline(g.band.label[lang], selectedLocation.name)) : copy.noEstimate}</p>${g ? `<p class="headline-impact">${safeText(g.band.impact[lang])}</p><small class="headline-note">${copy.bandSuffix}</small>` : ''}</div></div>${persona}</div>`;
    feed.innerHTML = briefingItems(data).map(item => `<div class="alert alert-${item.tone}"><span class="alert-icon" aria-hidden="true">${item.icon}</span><div>${item.tag ? `<small class="alert-tag">${safeText(item.tag)}</small>` : ''}<b>${safeText(item.title)}</b>${item.body ? `<p>${safeText(item.body)}</p>` : ''}</div></div>`).join('') + `<a class="alert-more" href="#guidance">${copy.seeGuidance}</a>`;
  }
  headline.querySelector('.persona-chip').addEventListener('click', () => { location.hash = '#guidance'; });
  renderPollutants();
}

function renderPollutants() {
  const copy = ui(), lang = langKey();
  const list = lastData?.pollutants || [];
  document.querySelector('.pollutant-section').innerHTML = list.length ? `<h3>${copy.pollutantsTitle}</h3><div class="pollutant-grid">${list.map(p => {
    const mine = p.affects.includes(selectedProfile);
    return `<article class="pollutant-card${mine ? ' mine' : ''}"><div class="pollutant-top"><b>${safeText(p.name)}</b><span class="band-pill" style="--band:${p.level.color}"><i></i>${safeText(p.level.label[lang])}</span></div><div class="pollutant-value">${p.value}<small> ${safeText(p.unit)}</small></div><p>${safeText(p.about[lang])}</p>${mine ? `<span class="affects-you">${PERSONAS[selectedProfile].icon} ${copy.affectsYou}</span>` : ''}</article>`;
  }).join('')}</div><small class="pollutant-note">${copy.pollutantsNote}</small>` : '';
}

function renderPersonal() {
  renderGuidance();
  renderBriefing();
  document.querySelector('.avatar').textContent = PERSONAS[selectedProfile].icon;
}

const arrow = (deg, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${(deg + 180) % 360}deg)" aria-hidden="true"><path d="M12 3v16m0-16-5 5m5-5 5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderWind() {
  const card = document.querySelector('.wind-card');
  const copy = ui(), wind = lastData?.wind;
  if (!wind || !Number.isFinite(wind.fromDeg)) { card.innerHTML = `<span class="section-kicker">${copy.windKicker}</span><p class="wind-note">${copy.windUnavailable}</p>`; return; }
  const inNcr = selectedLocation.latitude > 27.9 && selectedLocation.latitude < 29.3 && selectedLocation.longitude > 76.4 && selectedLocation.longitude < 77.9;
  const fromNw = wind.fromDeg >= 250 && wind.fromDeg <= 350;
  const strip = wind.hourly.filter((_, i) => i % 3 === 0).slice(0, 8).map(h => `<span class="wind-hour"><small>${formatTime(h.time)}</small>${arrow(h.fromDeg, 18)}<b>${h.speedKmh}</b></span>`).join('');
  card.innerHTML = `<div class="wind-main"><div class="wind-compass" aria-hidden="true"><span>N</span>${arrow(wind.fromDeg, 54)}</div><div><span class="section-kicker">${copy.windKicker}</span><h3>${copy.windTitle}</h3><p class="wind-now"><b>${copy.windFrom(wind.fromCompass)}</b> · ${wind.speedKmh} km/h${Number.isFinite(wind.gustKmh) ? ` · ${copy.gusts} ${wind.gustKmh} km/h` : ''}</p>${inNcr ? `<p class="wind-note ${fromNw ? 'warn' : ''}">${fromNw ? copy.ncrSmoke : copy.ncrClear}</p>` : ''}</div></div><div class="wind-strip" aria-label="${copy.next24}"><span class="wind-strip-label">${copy.next24} · km/h</span>${strip}</div>`;
}

function render(data) {
  lastData = data;
  const copy = ui();
  const estimate = data.estimate || {};
  const pm25 = Number.isFinite(estimate.pm2_5) ? Number(estimate.pm2_5) : null;
  aqiEl.textContent = pm25 == null ? '—' : pm25.toFixed(1);
  document.querySelector('.aqi-label').textContent = pm25 == null ? 'PM2.5 estimate unavailable' : estimate.method === 'open_meteo_model' ? 'Modelled PM2.5 concentration' : 'Indicative PM2.5 concentration';
  const band = data.guidance?.band;
  document.querySelector('.risk-tag').innerHTML = band ? `<span style="background:${band.color}"></span> ${safeText(band.label[langKey()])} · ${copy.bandSuffix}` : `<span></span> ${pm25 == null ? 'No current estimate' : 'PM2.5 · µg/m³'}`;
  document.querySelector('.aqi-range').replaceChildren('Indicative PM2.5 range ', rangeEl);
  rangeEl.textContent = estimate.range?.length === 2 ? `${estimate.range[0]} — ${estimate.range[1]} µg/m³` : 'Not enough current data';
  document.querySelector('.air-meta > div:nth-child(1) strong').innerHTML = `<span class="pollutant-dot"></span> PM2.5 <span class="meta-value">· ${pm25 == null ? 'unavailable' : `${pm25.toFixed(1)} µg/m³`}</span>`;
  const outliers = (data.stations || []).filter(s => s.flag).length;
  const built = estimate.stationCount ? `${estimate.stationCount} recent station${estimate.stationCount === 1 ? '' : 's'}` : copy.modelOnly;
  document.querySelector('.air-meta > div:nth-child(2) strong').textContent = `${built}${outliers ? ` · ${copy.outliers(outliers)}` : ''} · ${data.cache === 'hit' ? 'cached' : 'updated just now'}`;
  document.querySelector('.confidence b').textContent = 'Indicative estimate';
  document.querySelector('.confidence small').textContent = estimate.method === 'open_meteo_model' ? 'Model-only · not validated' : 'Spread, not a confidence interval';
  document.querySelector('.art-caption').innerHTML = '<span class="art-wave">〰</span> LIVE PROVIDER DATA';
  document.querySelector('.air-card .section-kicker').firstChild.textContent = 'LIVE SOURCES ';
  renderStations(data.stations);
  renderCoverageMap(data.stations);
  renderForecast(data.forecast);
  renderPersonal();
  renderWind();
  document.querySelector('.page-footer > span:last-child').innerHTML = `${safeText(data.disclaimer)} <i>·</i> <a href="https://docs.openaq.org/" target="_blank" rel="noreferrer">OpenAQ source ↗</a> <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo source ↗</a>`;
  setStatus(data.cache === 'stale' ? 'CACHED DATA' : 'LIVE DATA', data.cache === 'stale' ? 'warn' : 'ok');
}

let loadToken = 0;
async function loadAir() {
  const token = ++loadToken;
  document.querySelector('.local-card strong').textContent = selectedLocation.name;
  document.querySelector('.local-card div:nth-child(2) .tiny:last-child').textContent = selectedLocation.custom ? 'Shared device location' : 'India · selected area';
  document.querySelector('.location-select .location-name').textContent = selectedLocation.name;
  if (!API_BASE) {
    setStatus('API NOT CONFIGURED');
    document.querySelector('.aqi-label').textContent = 'Waiting for backend URL';
    rangeEl.textContent = 'Add the API URL in frontend-config.js';
    document.querySelector('.forecast-summary strong').textContent = 'Connect the Saans API to load live forecasts.';
    stationList.innerHTML = '<div class="empty-state">Live monitor readings will appear here after the API is deployed and connected.</div>';
    setAssistantEnabled(false);
    return;
  }
  setStatus('FETCHING AIR DATA');
  try {
    const url = `${API_BASE}/v1/air?lat=${encodeURIComponent(selectedLocation.latitude)}&lon=${encodeURIComponent(selectedLocation.longitude)}`;
    const result = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' });
    const data = await result.json();
    if (!result.ok) throw new Error(data.message || `API error ${result.status}`);
    if (token === loadToken) { render(data); setAssistantEnabled(true); }
  } catch (error) {
    if (token !== loadToken) return;
    setStatus('DATA UNAVAILABLE');
    document.querySelector('.aqi-label').textContent = 'Could not load live data';
    rangeEl.textContent = 'Check your connection, then try another city or refresh.';
    document.querySelector('.forecast-summary strong').textContent = navigator.onLine ? error.message : 'You appear to be offline.';
    document.querySelector('.today-headline .headline-title').textContent = navigator.onLine ? error.message : 'You appear to be offline.';
  }
}

function setAssistantEnabled(enabled) {
  const copy = ui();
  document.getElementById('chatFab').hidden = !enabled;
  document.getElementById('chatInput').disabled = !enabled;
  document.querySelector('#chatForm button').disabled = !enabled;
  document.querySelectorAll('.suggestion').forEach(button => button.disabled = !enabled);
  document.getElementById('chatInput').placeholder = enabled ? copy.askPlaceholder : 'Assistant needs the Saans API';
  document.querySelector('.assistant-online').innerHTML = enabled ? '<i></i> HERE FOR YOU' : 'NOT CONNECTED';
}

async function ask(question) {
  question = question.trim().slice(0, 300);
  if (!question || !API_BASE) return;
  const copy = ui(), input = document.getElementById('chatInput'), send = document.querySelector('#chatForm button');
  response.classList.add('show');
  response.innerHTML = `<p class="chat-q"><b>${copy.you}:</b> ${safeText(question)}</p><p class="chat-a pending">${copy.thinking}</p>`;
  input.value = '';
  input.disabled = send.disabled = true;
  try {
    const result = await fetch(`${API_BASE}/v1/ask`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, lat: selectedLocation.latitude, lon: selectedLocation.longitude, profile: selectedProfile, lang: currentLanguage, place: selectedLocation.name }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.message);
    response.querySelector('.chat-a').outerHTML = `<p class="chat-a">${safeText(data.answer)}</p><div class="chat-sources">${data.sources.map(s => `<a href="${safeText(s.url)}" target="_blank" rel="noreferrer">${safeText(s.label)} ↗</a>`).join('')}</div><small class="chat-mode">${data.mode === 'bedrock' ? copy.viaBedrock : copy.viaRules}</small>`;
  } catch {
    response.querySelector('.chat-a').outerHTML = `<p class="chat-a">${copy.askFailed}</p>`;
  } finally {
    input.disabled = send.disabled = false;
    input.focus();
  }
}

function setLocation(location) {
  selectedLocation = location;
  citySelect.value = location.custom ? '' : location.name;
  locationPicker.value = location.custom ? '' : location.name;
  try { location.custom ? localStorage.removeItem('saans-city') : localStorage.setItem('saans-city', location.name); } catch { /* session only */ }
  document.getElementById('settingsLocation').textContent = location.custom ? 'My location · updated' : `${location.name} · India`;
  loadAir();
}

function chooseCurrentLocation() {
  if (!navigator.geolocation) { toast('Location is not supported in this browser.'); return; }
  navigator.geolocation.getCurrentPosition(
    position => setLocation({ name: 'My location', latitude: position.coords.latitude, longitude: position.coords.longitude, custom: true }),
    () => { toast('Location permission was not granted. Choose a city instead.'); locationPicker.value = selectedLocation.custom ? '' : selectedLocation.name; },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}

// Header location control: a native <select> laid over the pill gives a real dropdown on every device.
const cityOptions = () => INDIA_CITIES.map(city => `<option value="${safeText(city.name)}">${safeText(city.name)}</option>`).join('');
const locationPill = document.createElement('label');
locationPill.className = 'location-select';
locationPill.innerHTML = `<span class="pin">⌖</span> <span class="location-name">${safeText(selectedLocation.name)}</span> <span class="chevron">⌄</span><select class="location-picker" aria-label="Choose location"><option value="" disabled>My location</option><option value="__geo">${ui().useMyLocation}</option>${cityOptions()}</select>`;
document.querySelector('.location-select').replaceWith(locationPill);
const locationPicker = locationPill.querySelector('.location-picker');
locationPicker.addEventListener('change', () => {
  if (locationPicker.value === '__geo') return chooseCurrentLocation();
  const city = INDIA_CITIES.find(item => item.name === locationPicker.value);
  if (city) setLocation(city);
});

document.querySelector('.air-card .more-btn').addEventListener('click', loadAir);
document.getElementById('chatForm').addEventListener('submit', event => { event.preventDefault(); ask(document.getElementById('chatInput').value); });
document.querySelectorAll('.suggestion').forEach(button => button.addEventListener('click', () => ask(button.dataset.question)));

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.getElementById('installBtn').classList.add('install-ready');
});
document.getElementById('installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) { toast('To install, use your browser menu: “Install app” or “Add to Home screen”.'); return; }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

// Name screen persona picker; the same screen edits name + persona later from the profile button.
const personaGrid = document.getElementById('personaGrid');
let pendingPersona = selectedProfile;
function renderPersonaGrid() {
  const keep = selectedProfile;
  selectedProfile = pendingPersona;
  personaGrid.innerHTML = personaOptions('persona-option');
  selectedProfile = keep;
}
personaGrid.addEventListener('click', event => {
  const button = event.target.closest('.persona-option');
  if (!button) return;
  pendingPersona = button.dataset.profile;
  renderPersonaGrid();
});

let renaming = false;
function enterSaans(name) {
  const cleanName = name.trim().slice(0, 40);
  if (!cleanName) return;
  try { localStorage.setItem('saans-display-name', cleanName); } catch { /* name remains for this session */ }
  document.getElementById('welcomeScreen').hidden = true;
  document.getElementById('nameScreen').hidden = true;
  document.querySelector('.app-shell').hidden = false;
  document.querySelector('.mobile-nav').hidden = false;
  document.body.classList.add('in-app');
  document.querySelector('.profile-name').textContent = cleanName;
  document.getElementById('settingsLocation').textContent = `${selectedLocation.name} · change location`;
  setPersona(pendingPersona);
  renderHeadings();
  if (renaming) { renaming = false; document.getElementById('chatFab').hidden = !lastData; return; }
  loadAir();
}

buildPages();
document.getElementById('useCurrentLocation').addEventListener('click', chooseCurrentLocation);
const citySelect = document.getElementById('citySelect');
citySelect.innerHTML = `<option value="">Choose a city</option>${cityOptions()}`;
try {
  const savedCity = localStorage.getItem('saans-city');
  const match = INDIA_CITIES.find(city => city.name === savedCity);
  if (match) selectedLocation = match;
} catch { /* retain the India default */ }
citySelect.value = locationPicker.value = selectedLocation.name;
citySelect.addEventListener('change', () => {
  const city = INDIA_CITIES.find(item => item.name === citySelect.value);
  if (city) setLocation(city);
});
document.querySelector('.local-card .dots').addEventListener('click', () => {
  location.hash = '#more';
  citySelect.focus({ preventScroll: true });
});
document.querySelector('.profile-button').addEventListener('click', () => {
  renaming = true;
  pendingPersona = selectedProfile;
  renderPersonaGrid();
  document.querySelector('.app-shell').hidden = true;
  document.querySelector('.mobile-nav').hidden = true;
  document.getElementById('chatFab').hidden = true;
  document.getElementById('chatPanel').hidden = true;
  document.body.classList.remove('in-app');
  document.getElementById('nameScreen').hidden = false;
  const input = document.getElementById('nameInput');
  input.value = displayName();
  input.select();
});
const translations = {
  en: { welcomeTitle: 'Know the air.<br><em>Find your next breath.</em>', welcomeDesc: 'Saans brings together nearby monitors, weather and smoke movement to make the air around you easier to understand — starting with communities across India.', next: 'Next', featureTitle: 'Understand the air where you live in India.', airTile: 'See what’s in the air', watchTile: 'Follow what’s moving', guideTile: 'Make it personal', chatTile: 'Ask in your own words', settings: 'Settings', language: 'Language', location: 'Location', city: 'Indian city', reduceMotion: 'Reduce motion', howTo: 'How to use Saans', dataPrivacy: 'Data and privacy', nameTitle: 'Who is Saans<br><em>planning for?</em>', personaLegend: 'WHO ARE YOU PLANNING FOR?', enter: 'Enter Saans' },
  hi: { welcomeTitle: 'हवा को जानें।<br><em>अपनी अगली साँस को समझें।</em>', welcomeDesc: 'Saans आसपास के मॉनिटर, मौसम और धुएँ की दिशा को जोड़ता है — भारत के शहरों और समुदायों के लिए।', next: 'आगे', featureTitle: 'भारत में अपने शहर की हवा को समझें।', airTile: 'हवा में क्या है', watchTile: 'हवा की दिशा देखें', guideTile: 'आपके परिवार के लिए', chatTile: 'अपने शब्दों में पूछें', settings: 'सेटिंग', language: 'भाषा', location: 'स्थान', city: 'भारतीय शहर', reduceMotion: 'गतिशीलता कम करें', howTo: 'Saans का उपयोग कैसे करें', dataPrivacy: 'डेटा और गोपनीयता', nameTitle: 'Saans किसके लिए<br><em>योजना बनाए?</em>', personaLegend: 'आप किसके लिए योजना बना रहे हैं?', enter: 'Saans खोलें' }
};
function applyLanguage(language) {
  currentLanguage = translations[language] ? language : 'en';
  const copy = translations[currentLanguage];
  document.documentElement.lang = currentLanguage;
  document.querySelector('.welcome-hero-copy h1').innerHTML = copy.welcomeTitle;
  document.querySelector('.welcome-hero-copy>p').textContent = copy.welcomeDesc;
  document.querySelector('#nextButton').innerHTML = `${copy.next} <span>→</span>`;
  document.querySelector('.feature-overview-heading h2').textContent = copy.featureTitle;
  [copy.airTile, copy.watchTile, copy.guideTile, copy.chatTile].forEach((value, index) => { document.querySelectorAll('.feature-tile h3')[index].textContent = value; });
  document.querySelector('.settings-card h3').textContent = copy.settings;
  document.querySelector('.help-card h3').textContent = copy.howTo;
  document.querySelector('.sources-card h3').textContent = copy.dataPrivacy;
  document.querySelector('label[for="languageSelect"] b').textContent = copy.language;
  document.querySelector('#useCurrentLocation b').textContent = copy.location;
  document.querySelector('label[for="citySelect"] b').textContent = copy.city;
  document.querySelector('.motion-setting b').textContent = copy.reduceMotion;
  document.querySelector('.name-card h1').innerHTML = copy.nameTitle;
  document.querySelector('.persona-field legend').textContent = copy.personaLegend;
  document.querySelector('.enter-button').innerHTML = `${copy.enter} <span>→</span>`;
  locationPicker.querySelector('option[value="__geo"]').textContent = ui().useMyLocation;
  if (!document.getElementById('chatInput').disabled) document.getElementById('chatInput').placeholder = ui().askPlaceholder;
  renderPersonaGrid();
  renderHeadings();
  if (lastData) render(lastData); else renderPersonal();
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
  if (renaming) { pendingPersona = selectedProfile; enterSaans(displayName()); return; }
  document.getElementById('welcomeScreen').hidden = false;
});
document.getElementById('nameForm').addEventListener('submit', event => {
  event.preventDefault();
  enterSaans(document.getElementById('nameInput').value);
});
let savedName = '';
try { savedName = localStorage.getItem('saans-display-name') || ''; } catch { /* private browsing may disable storage */ }
if (savedName) enterSaans(savedName);
