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
// Health conditions must match CONDITIONS in backend/src/guidance.mjs; "pollutants" are the ones Saans highlights for them.
const CONDITIONS = {
  asthma: { icon: '🫁', en: 'Asthma', hi: 'अस्थमा', pollutants: ['pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone', 'sulphur_dioxide'] },
  copd: { icon: '🌬️', en: 'COPD / chronic bronchitis', hi: 'COPD / पुरानी ब्रोंकाइटिस', pollutants: ['pm2_5', 'pm10', 'nitrogen_dioxide', 'ozone', 'sulphur_dioxide'] },
  allergy: { icon: '🤧', en: 'Dust or pollen allergy', hi: 'धूल या पराग से एलर्जी', pollutants: ['pm10', 'pm2_5', 'ozone'] },
  heart: { icon: '🫀', en: 'Heart disease or high BP', hi: 'हृदय रोग या हाई BP', pollutants: ['pm2_5', 'carbon_monoxide', 'nitrogen_dioxide'] },
  diabetes: { icon: '🩸', en: 'Diabetes', hi: 'डायबिटीज़', pollutants: ['pm2_5', 'nitrogen_dioxide'] }
};
const PAGE_IDS = ['today', 'overview', 'airspace', 'health', 'area-watch', 'more'];
let selectedLocation = DEFAULT_LOCATION;
let deferredInstallPrompt;
let lastData = null;
let currentLanguage = 'en';
let selectedProfile = 'general';
let selectedConditions = null; // null = never asked, [] = "no condition"
try { if (PERSONA_KEYS.includes(localStorage.getItem('saans-profile'))) selectedProfile = localStorage.getItem('saans-profile'); } catch { /* default persona */ }
try { const saved = JSON.parse(localStorage.getItem('saans-conditions')); if (Array.isArray(saved)) selectedConditions = saved.filter(c => c in CONDITIONS); } catch { /* not asked yet */ }
const myConditions = () => selectedConditions || [];
const affectsMe = p => p.affects.includes(selectedProfile) || myConditions().some(c => CONDITIONS[c].pollutants.includes(p.key));

// Strings for the live (data-driven) parts of the app.
const UI = {
  en: { bandSuffix: 'CPCB PM2.5 band · indicative', guidanceKicker: 'GUIDANCE FOR TODAY', forWho: 'What to do', cpcbSays: 'CPCB health impact', cleanest: 'Cleanest hours in the next day (model)',
    editProfile: 'Change persona or conditions', condTag: label => `Your condition · ${label}`,
    aqiCircle: 'AQI · indicative', aqiMostly: name => `Mostly ${name}`, aqiNote: 'Indicative AQI (CPCB method on model data), not the official CPCB AQI.', outlookL: h => `In ${h} h`,
    tipAt: (t, pm, aqi) => `<b>${t}</b>PM2.5 ${pm} µg/m³${aqi == null ? '' : ` · AQI ${aqi}`}`, spike: 'Spike', dip: 'Dip', explainTitle: 'Why the line jumps', explainLoading: 'Looking for unusual hours…', explainNone: 'No unusual spikes or dips in this period.', viaBedrockShort: 'Explained by Amazon Bedrock', viaRulesShort: 'Explained from weather data',
    legendTitle: 'What the colours mean', legendCols: ['Band', 'PM2.5 µg/m³', 'AQI'], legendMove: 'Moving from green towards maroon, the air affects more people, sooner: first those with asthma, heart disease, children and older adults, then everyone after long exposure, and at Severe even healthy people within hours.', legendPins: 'Grey pin = outlier, excluded · faded pin = stale reading · ⌂ = you',
    indoorKicker: 'INDOOR AIR', indoorTitle: 'Cleaner air at home', indoorIntro: pm => `Outdoor PM2.5 is ~${pm} µg/m³. With windows shut, part of it still leaks in, so indoor air is rarely much cleaner without a filter.`,
    wardKicker: 'DELHI WARD FORECAST · GRAPH NEURAL NETWORK', wardTitle: name => `AQI outlook for ${name}`, wardBody: km => `Nearest of 289 wards (~${km} km). Range = 80% conformal interval.`, wardNote: 'WardGraphTransformer trained on CPCB stations (mansi724/PROJECT-AQI), run hourly on CAMS + weather.',
    newChat: 'New chat',
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
    tempL: 'Temperature', humidL: 'Humidity', blhL: 'Mixing height', viL: 'Ventilation', vi: { good: 'Disperses', low: 'Weak mixing', poor: 'Stagnant' },
    viExplain: 'Ventilation = wind speed × mixing height. Below 6000 m²/s with light wind, pollution stays near the ground (IMD).', wxKicker: 'LIVE WEATHER · OPEN-METEO',
    stagnant: blh => `Air is stagnant: the mixing layer is only ~${blh} m deep`, stagnantBody: (vi, at) => `Ventilation is ${vi} m²/s, below 6000, so pollution stays close to the ground.${at ? ` The air should mix best around ${at}.` : ''}`,
    firesUp: n => `${n} fire${n === 1 ? '' : 's'} upwind in the last 24 hours`, firesUpBody: (states, km, dir) => `Mostly ${states}; nearest ~${km} km. Wind from the ${dir} can carry their smoke here. See Area watch.`,
    fireKicker: 'NASA FIRMS · VIIRS 375 m · NEAR REAL TIME', fireTitle: 'Fires, and where your air comes from', days: d => `${d} day${d > 1 ? 's' : ''}`,
    wedge: 'Upwind zone · 500 km', fireNotConfigured: 'Fire hotspots need a free NASA FIRMS MAP_KEY on the server. The upwind zone is live.', fireUnavailable: 'Fire data is unavailable right now.',
    fireTotal: (n, shown) => `${n.toLocaleString('en-IN')} fire detections in India and border areas${shown < n ? ` · strongest ${shown.toLocaleString('en-IN')} shown` : ''}`,
    fireUp: (n, km) => n ? `${n} upwind in the last 24 h · nearest ${km} km` : 'No fires upwind in the last 24 h', byState: 'Detections by state', frp: 'Fire power (FRP)',
    histKicker: 'PAST WEATHER · ERA5 + CAMS', histTitle: d => `The last ${d} days`, histLoading: 'Loading past weather…', histFailed: 'Past weather is unavailable right now.', csv: '⤓ CSV',
    histBacktest: (n, total, poor, good) => `The air was stagnant (peak ventilation under 6000 m²/s) on ${n} of ${total} days. Model PM2.5 averaged ${poor ?? '—'} µg/m³ on those days and ${good ?? '—'} µg/m³ on the rest.`,
    histCorr: r => `Correlation between ventilation and PM2.5: ${r}. Rain and wind direction also matter, so this is a pattern, not proof.`, histLegend: ['Daily PM2.5 (CAMS model)', 'Peak ventilation (ERA5)'],
    searchPlaceholder: 'Search any Indian locality…', noResults: 'No places found', cities: 'CITIES', results: 'PLACES', deviceLocation: 'Shared device location', mapFoot: 'Colour = CPCB PM2.5 band', mapNote: 'NUMBERS MATCH THE LIST',
    pages: {
      today: { kicker: 'TODAY FOR YOU', title: name => `Hi ${name}, here is your air today`, desc: 'Alerts and steps for the person you are planning for, from live data.' },
      overview: { kicker: 'YOUR NEIGHBOURHOOD', title: () => 'Overview', desc: 'The current PM2.5 estimate and the next hours from the model.' },
      airspace: { kicker: 'THE NETWORK', title: () => 'Airspace', desc: 'Nearby monitors, how fresh they are, and where they sit around you.' },
      health: { kicker: 'YOUR BODY AND THIS AIR', title: () => 'Health & guidance', desc: 'What to do today for you and any condition, how to keep indoor air cleaner, and where each pollutant lands in your lungs.' },
      'area-watch': { kicker: 'BEYOND YOUR STREET', title: () => 'Area watch', desc: 'Live wind, how well the air is mixing, and NASA fire hotspots that could send smoke your way.' },
      more: { kicker: 'YOUR SAANS', title: () => 'More', desc: 'Keep the essentials close and your preferences yours.' } } },
  hi: { bandSuffix: 'CPCB PM2.5 श्रेणी · संकेतात्मक', guidanceKicker: 'आज के लिए सलाह', forWho: 'क्या करें', cpcbSays: 'CPCB के अनुसार स्वास्थ्य प्रभाव', cleanest: 'अगले 24 घंटों में सबसे साफ़ समय (मॉडल)',
    editProfile: 'व्यक्ति या बीमारी बदलें', condTag: label => `आपकी स्थिति · ${label}`,
    aqiCircle: 'AQI · संकेतात्मक', aqiMostly: name => `मुख्यतः ${name}`, aqiNote: 'संकेतात्मक AQI (मॉडल डेटा पर CPCB तरीका), आधिकारिक CPCB AQI नहीं।', outlookL: h => `${h} घंटे में`,
    tipAt: (t, pm, aqi) => `<b>${t}</b>PM2.5 ${pm} µg/m³${aqi == null ? '' : ` · AQI ${aqi}`}`, spike: 'उछाल', dip: 'गिरावट', explainTitle: 'रेखा क्यों उछलती है', explainLoading: 'असामान्य घंटे खोज रहे हैं…', explainNone: 'इस अवधि में कोई असामान्य उछाल या गिरावट नहीं।', viaBedrockShort: 'Amazon Bedrock द्वारा व्याख्या', viaRulesShort: 'मौसम डेटा से व्याख्या',
    legendTitle: 'रंगों का मतलब', legendCols: ['श्रेणी', 'PM2.5 µg/m³', 'AQI'], legendMove: 'हरे से गहरे लाल की ओर बढ़ने पर हवा ज़्यादा लोगों पर और जल्दी असर करती है: पहले अस्थमा, हृदय रोगी, बच्चे और बुज़ुर्ग, फिर लंबे संपर्क में सभी, और गंभीर स्तर पर स्वस्थ लोग भी कुछ घंटों में।', legendPins: 'धूसर पिन = असामान्य, हटाया · हल्का पिन = पुरानी रीडिंग · ⌂ = आप',
    indoorKicker: 'घर के अंदर की हवा', indoorTitle: 'घर में साफ़ हवा', indoorIntro: pm => `बाहर PM2.5 ~${pm} µg/m³ है। खिड़कियाँ बंद होने पर भी इसका कुछ हिस्सा अंदर आता है, इसलिए फ़िल्टर के बिना अंदर की हवा ज़्यादा साफ़ नहीं होती।`,
    wardKicker: 'दिल्ली वार्ड पूर्वानुमान · ग्राफ़ न्यूरल नेटवर्क', wardTitle: name => `${name} के लिए AQI अनुमान`, wardBody: km => `289 वार्डों में सबसे पास (~${km} km)। सीमा = 80% कॉन्फ़ॉर्मल अंतराल।`, wardNote: 'CPCB स्टेशनों पर प्रशिक्षित WardGraphTransformer (mansi724/PROJECT-AQI), हर घंटे CAMS + मौसम पर चलता है।',
    newChat: 'नई बातचीत',
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
    tempL: 'तापमान', humidL: 'नमी', blhL: 'मिश्रण परत', viL: 'वेंटिलेशन', vi: { good: 'फैल रहा है', low: 'कमज़ोर मिश्रण', poor: 'रुकी हुई हवा' },
    viExplain: 'वेंटिलेशन = हवा की गति × मिश्रण परत की ऊँचाई। धीमी हवा के साथ 6000 m²/s से कम होने पर प्रदूषण ज़मीन के पास रुका रहता है (IMD)।', wxKicker: 'लाइव मौसम · OPEN-METEO',
    stagnant: blh => `हवा रुकी हुई है: मिश्रण परत सिर्फ़ ~${blh} m गहरी है`, stagnantBody: (vi, at) => `वेंटिलेशन ${vi} m²/s है, 6000 से कम, इसलिए प्रदूषण ज़मीन के पास रहता है।${at ? ` हवा ${at} के आसपास सबसे अच्छी तरह मिलेगी।` : ''}`,
    firesUp: n => `पिछले 24 घंटों में हवा की दिशा में ${n} आग`, firesUpBody: (states, km, dir) => `ज़्यादातर ${states}; सबसे पास ~${km} km। ${dir} से आती हवा उनका धुआँ यहाँ ला सकती है। क्षेत्र पर नज़र देखें।`,
    fireKicker: 'NASA FIRMS · VIIRS 375 m · लगभग रियल टाइम', fireTitle: 'आग, और आपकी हवा कहाँ से आती है', days: d => `${d} दिन`,
    wedge: 'हवा आने का क्षेत्र · 500 km', fireNotConfigured: 'आग के स्थान दिखाने के लिए सर्वर पर मुफ़्त NASA FIRMS MAP_KEY चाहिए। हवा का क्षेत्र लाइव है।', fireUnavailable: 'आग का डेटा अभी उपलब्ध नहीं है।',
    fireTotal: (n, shown) => `भारत और सीमा क्षेत्रों में ${n.toLocaleString('en-IN')} आग दर्ज${shown < n ? ` · सबसे तेज़ ${shown.toLocaleString('en-IN')} दिखाई गईं` : ''}`,
    fireUp: (n, km) => n ? `पिछले 24 घंटों में हवा की दिशा में ${n} · सबसे पास ${km} km` : 'पिछले 24 घंटों में हवा की दिशा में कोई आग नहीं', byState: 'राज्य के अनुसार', frp: 'आग की ताक़त (FRP)',
    histKicker: 'पिछला मौसम · ERA5 + CAMS', histTitle: d => `पिछले ${d} दिन`, histLoading: 'पिछला मौसम लोड हो रहा है…', histFailed: 'पिछला मौसम अभी उपलब्ध नहीं है।', csv: '⤓ CSV',
    histBacktest: (n, total, poor, good) => `${total} में से ${n} दिन हवा रुकी रही (अधिकतम वेंटिलेशन 6000 m²/s से कम)। उन दिनों मॉडल PM2.5 औसत ${poor ?? '—'} µg/m³ और बाकी दिनों ${good ?? '—'} µg/m³ रहा।`,
    histCorr: r => `वेंटिलेशन और PM2.5 का सहसंबंध: ${r}। बारिश और हवा की दिशा का भी असर होता है, इसलिए यह एक पैटर्न है, प्रमाण नहीं।`, histLegend: ['रोज़ का PM2.5 (CAMS मॉडल)', 'अधिकतम वेंटिलेशन (ERA5)'],
    searchPlaceholder: 'भारत का कोई भी इलाका खोजें…', noResults: 'कोई जगह नहीं मिली', cities: 'शहर', results: 'जगहें', deviceLocation: 'डिवाइस का स्थान', mapFoot: 'रंग = CPCB PM2.5 श्रेणी', mapNote: 'नंबर सूची से मेल खाते हैं',
    pages: {
      today: { kicker: 'आज आपके लिए', title: name => `नमस्ते ${name}, आज आपकी हवा ऐसी है`, desc: 'लाइव डेटा से आपके चुने व्यक्ति के लिए अलर्ट और कदम।' },
      overview: { kicker: 'आपका इलाका', title: () => 'सारांश', desc: 'मौजूदा PM2.5 अनुमान और मॉडल के अनुसार अगले घंटे।' },
      airspace: { kicker: 'नेटवर्क', title: () => 'वायु क्षेत्र', desc: 'आसपास के मॉनिटर, उनका डेटा कितना ताज़ा है, और वे कहाँ हैं।' },
      health: { kicker: 'आपका शरीर और यह हवा', title: () => 'सेहत और सलाह', desc: 'आज आपके और आपकी बीमारी के लिए क्या करें, घर की हवा कैसे साफ़ रखें, और हर प्रदूषक फेफड़ों में कहाँ पहुँचता है।' },
      'area-watch': { kicker: 'आपकी गली से आगे', title: () => 'क्षेत्र पर नज़र', desc: 'लाइव हवा, हवा कितनी मिल रही है, और NASA के आग वाले स्थान जिनका धुआँ आप तक आ सकता है।' },
      more: { kicker: 'आपका SAANS', title: () => 'और', desc: 'ज़रूरी चीज़ें पास रखें, अपनी पसंद अपनी रखें।' } } }
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
  const indoorCard = document.createElement('article');
  indoorCard.className = 'card indoor-card';
  const wardCard = document.createElement('article');
  wardCard.className = 'card ward-card';
  wardCard.hidden = true;
  map.append(Object.assign(document.createElement('div'), { className: 'band-legend' }));
  const windCard = document.createElement('article');
  windCard.className = 'card wind-card';
  const fireCard = document.createElement('article');
  fireCard.className = 'card fire-card';
  fireCard.innerHTML = '<div class="fire-head"></div><div class="fire-layout"><div class="fire-map"></div><div class="fire-side"></div></div>';
  fireCard.addEventListener('click', event => { const button = event.target.closest('[data-days]'); if (button) loadFires(Number(button.dataset.days)); });
  const historyCard = document.createElement('article');
  historyCard.className = 'card history-card';
  historyCard.addEventListener('click', event => { const button = event.target.closest('[data-days]'); if (button) { historyDays = Number(button.dataset.days); historyCard.dataset.key = ''; loadHistory(); } });

  grid.append(
    today,
    page('overview', div('air-primary', air, forecast), wardCard, historyCard),
    page('airspace', div('air-secondary', map, stations)),
    page('health', div('guidance-grid', adviceCard, indoorCard), div('health-body')),
    page('area-watch', windCard, fireCard));
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
}

function renderHeadings() {
  const pages = ui().pages;
  PAGE_IDS.forEach(id => {
    const copy = pages[id];
    document.querySelector(`#${id} > .group-heading`).innerHTML = `<div><span class="section-kicker">${copy.kicker}</span><h2>${safeText(copy.title(displayName()))}</h2></div><p>${copy.desc}</p>`;
  });
  const labels = currentLanguage === 'hi' ? ['आज', 'सारांश', 'वायु क्षेत्र', 'सेहत और सलाह', 'क्षेत्र पर नज़र', 'और'] : ['Today', 'Overview', 'Airspace', 'Health & guidance', 'Area watch', 'More'];
  document.querySelectorAll('.side-nav .nav-item').forEach((item, index) => { const icon = item.querySelector('.nav-icon')?.outerHTML || ''; item.innerHTML = `${icon} ${safeText(labels[index])}`; });
  const mobile = currentLanguage === 'hi' ? ['आज', 'सारांश', 'वायु', 'सेहत', 'क्षेत्र', 'और'] : ['Today', 'Overview', 'Airspace', 'Health', 'Area', 'More'];
  document.querySelectorAll('.mobile-nav a').forEach((item, index) => { const icon = item.querySelector('span')?.outerHTML || ''; item.innerHTML = `${icon}${mobile[index]}`; });
  showPage(location.hash.slice(1), false);
}

// One page at a time; the URL hash is the router so links, back button and refresh all work.
function showPage(id, scroll = true) {
  if (id === 'guidance') { history.replaceState(null, '', '#health'); id = 'health'; } // old links
  if (!PAGE_IDS.includes(id)) id = 'today';
  PAGE_IDS.forEach(pageId => { document.getElementById(pageId).hidden = pageId !== id; });
  document.querySelectorAll('.side-nav .nav-item').forEach(item => item.classList.toggle('active', item.getAttribute('href') === `#${id}`));
  document.querySelectorAll('.mobile-nav a').forEach(item => item.classList.toggle('mobile-active', item.getAttribute('href') === `#${id}`));
  const label = document.querySelector(`.side-nav .nav-item[href="#${id}"]`)?.lastChild.textContent.trim();
  document.querySelector('.breadcrumb strong').textContent = label || '';
  if (scroll) window.scrollTo(0, 0);
  refreshMaps();
  if (id === 'overview') loadHistory();
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

const BANDS = [[30, '#3f9b6b', 'Good', 'अच्छा'], [60, '#8bb35a', 'Satisfactory', 'संतोषजनक'], [90, '#d9a93c', 'Moderate', 'मध्यम'], [120, '#d9793c', 'Poor', 'ख़राब'], [250, '#c2453a', 'Very poor', 'बहुत ख़राब'], [Infinity, '#7d2a3a', 'Severe', 'गंभीर']];
const bandOf = pm => BANDS.find(b => pm <= b[0]) || BANDS.at(-1);
// CPCB ranges and health impact per band, same order as BANDS.
const BAND_INFO = [
  ['0–30', '0–50', 'Minimal impact.', 'न्यूनतम प्रभाव।'],
  ['31–60', '51–100', 'Minor breathing discomfort for sensitive people.', 'संवेदनशील लोगों को साँस में हल्की तकलीफ़।'],
  ['61–90', '101–200', 'Discomfort for people with asthma or heart disease, children and older adults.', 'अस्थमा या हृदय रोगियों, बच्चों और बुज़ुर्गों को तकलीफ़।'],
  ['91–120', '201–300', 'Breathing discomfort for most people on long exposure.', 'लंबे संपर्क में ज़्यादातर लोगों को साँस में तकलीफ़।'],
  ['121–250', '301–400', 'Respiratory illness on long exposure; worse for lung and heart patients.', 'लंबे संपर्क से साँस की बीमारी; फेफड़े व हृदय रोगियों पर ज़्यादा असर।'],
  ['250+', '401–500', 'Affects healthy people; serious for anyone already ill.', 'स्वस्थ लोगों पर भी असर; बीमार लोगों के लिए गंभीर।']];

function renderBandLegend() {
  const copy = ui(), hi = langKey() === 'hi';
  const now = lastData?.guidance?.band.index;
  document.querySelector('.band-legend').innerHTML = `<h3>${copy.legendTitle}</h3><div class="band-rows" role="table"><div class="band-row band-head" role="row">${copy.legendCols.map(c => `<span role="columnheader">${c}</span>`).join('')}<span></span></div>${BANDS.map((b, i) => `<div class="band-row${i === now ? ' now' : ''}" role="row"><span role="cell"><i style="--c:${b[1]}"></i><b>${b[hi ? 3 : 2]}</b></span><span role="cell">${BAND_INFO[i][0]}</span><span role="cell">${BAND_INFO[i][1]}</span><small role="cell">${BAND_INFO[i][hi ? 3 : 2]}</small></div>`).join('')}</div><p class="band-move">${copy.legendMove}</p><small class="muted">${copy.legendPins}</small>`;
}
const inNcr = () => selectedLocation.latitude > 27.9 && selectedLocation.latitude < 29.3 && selectedLocation.longitude > 76.4 && selectedLocation.longitude < 77.9;
const hasLeaflet = () => typeof L !== 'undefined';
const maps = {};
const homeIcon = () => L.divIcon({ className: '', html: '<span class="home-pin"></span>', iconSize: [18, 18] });

function baseMap(key, el) {
  if (maps[key]) return maps[key];
  el.replaceChildren();
  const map = L.map(el, { preferCanvas: true, scrollWheelZoom: false });
  // ponytail: OSM's free tile server (light use only, attribution required); switch to a keyed provider if traffic grows.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  return (maps[key] = { map, layer: L.layerGroup().addTo(map), bounds: null });
}

// Leaflet measures its container, so maps on hidden pages are resized and fitted when their page opens.
function refreshMaps() {
  Object.values(maps).forEach(m => {
    if (!m.map.getContainer().offsetParent) return;
    m.map.invalidateSize();
    if (m.bounds) { m.map.fitBounds(m.bounds, { maxZoom: 13 }); m.bounds = null; }
  });
}

// Point reached from [lat, lon] after km along a compass bearing (great circle).
function destination([lat, lon], bearingDeg, km) {
  const rad = Math.PI / 180, d = km / 6371, b = bearingDeg * rad, p1 = lat * rad;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = lon * rad + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / rad, l2 / rad];
}

function renderCoverageMap(stations = []) {
  if (!hasLeaflet()) return renderSchematicMap(stations);
  const copy = ui(), lang = langKey();
  const m = baseMap('stations', document.querySelector('.map-view'));
  m.layer.clearLayers();
  const home = [selectedLocation.latitude, selectedLocation.longitude];
  const pts = stations.filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  const maxKm = Math.max(2, ...pts.map(s => s.distanceKm));
  L.circle(home, { radius: maxKm * 1000, color: '#4e8676', weight: 1, dashArray: '4 5', fillColor: '#d6e7d8', fillOpacity: .18, interactive: false }).addTo(m.layer);
  L.marker(home, { icon: homeIcon(), title: selectedLocation.name, keyboard: false }).addTo(m.layer);
  pts.forEach((s, i) => {
    const band = bandOf(s.pm2_5);
    L.marker([s.latitude, s.longitude], { title: s.name, icon: L.divIcon({ className: '', iconSize: [26, 26], html: `<span class="st-pin${s.status !== 'reporting' ? ' stale' : ''}" style="--c:${s.flag ? '#8a8f8c' : band[1]}">${i + 1}</span>` }) })
      .bindPopup(`<b>${safeText(s.name)}</b><br>${Number(s.pm2_5).toFixed(1)} µg/m³ · ${safeText(s.flag ? copy.outlierTag : band[lang === 'hi' ? 3 : 2])}<br><small>${s.distanceKm} km · ${s.status === 'reporting' ? copy.recent : copy.stale} · OpenAQ</small>`).addTo(m.layer);
  });
  m.bounds = pts.length ? L.latLngBounds([home, ...pts.map(s => [s.latitude, s.longitude])]).pad(.12) : L.latLng(home).toBounds(12000);
  document.querySelector('.map-foot').innerHTML = `<span>${copy.mapFoot} · <i class="key-dot" style="--c:#3f9b6b"></i><i class="key-dot" style="--c:#d9a93c"></i><i class="key-dot" style="--c:#d9793c"></i><i class="key-dot" style="--c:#c2453a"></i></span><span>OpenAQ · ${copy.mapNote}</span>`;
  refreshMaps();
}

// Area watch fire map: NASA FIRMS detections, the 500 km upwind wedge and per-state counts.
let fireDays = 1;
const fireCache = {};
async function loadFires(days = fireDays) {
  fireDays = days;
  if (!API_BASE) return;
  if (!fireCache[days]) {
    renderFires();
    try {
      const result = await fetch(`${API_BASE}/v1/fires?days=${days}`);
      const data = await result.json();
      if (!result.ok) throw new Error(data.message);
      fireCache[days] = data;
    } catch {
      fireCache[days] = { state: 'temporarily_unavailable', points: [] };
      setTimeout(() => { delete fireCache[days]; }, 60000);
    }
  }
  if (days === fireDays) renderFires();
}

function renderFires() {
  const card = document.querySelector('.fire-card');
  const copy = ui(), fires = fireCache[fireDays], w = lastData?.weather, up = lastData?.fires;
  card.querySelector('.fire-head').innerHTML = `<div><span class="section-kicker">${copy.fireKicker}</span><h3>${copy.fireTitle}</h3></div><div class="seg" role="group">${[1, 3, 7].map(d => `<button type="button" data-days="${d}" class="${d === fireDays ? 'on' : ''}" aria-pressed="${d === fireDays}">${copy.days(d)}</button>`).join('')}</div>`;
  const side = card.querySelector('.fire-side');
  if (!fires) side.innerHTML = `<p class="muted">${copy.loading}</p>`;
  else if (fires.state === 'not_configured') side.innerHTML = `<p class="fire-note">${copy.fireNotConfigured}</p>`;
  else if (fires.state !== 'available') side.innerHTML = `<p class="fire-note">${copy.fireUnavailable}</p>`;
  else {
    const max = Math.max(1, ...fires.byState.map(s => s.count));
    side.innerHTML = `${up?.state === 'available' ? `<div class="fire-up${up.count ? ' warn' : ''}"><b>${copy.fireUp(up.count, up.nearestKm)}</b>${up.count ? `<small>${up.topStates.map(s => `${safeText(s.state)} ${s.count}`).join(' · ')}</small>` : ''}</div>` : ''}
      <p class="fire-total">${copy.fireTotal(fires.count, fires.shown)}</p><span class="section-kicker">${copy.byState}</span>
      <div class="state-bars">${fires.byState.map(s => `<div class="state-bar"><span>${safeText(s.state)}</span><i style="--w:${(s.count / max * 100).toFixed(1)}%"></i><b>${s.count.toLocaleString('en-IN')}</b></div>`).join('')}</div>
      <div class="frp-legend"><span class="section-kicker">${copy.frp}</span><span><i style="background:#f2b33d"></i>&lt; 10 MW</span><span><i style="background:#e8743b"></i>10–50</span><span><i style="background:#b8261f"></i>&gt; 50</span></div>`;
  }
  if (!hasLeaflet()) return;
  const m = baseMap('fires', card.querySelector('.fire-map'));
  m.layer.clearLayers();
  const home = [selectedLocation.latitude, selectedLocation.longitude];
  let bounds = L.latLngBounds([[6, 68], [37, 97.5]]);
  if (w && Number.isFinite(w.fromDeg)) {
    const wedge = [home, ...Array.from({ length: 15 }, (_, i) => destination(home, w.fromDeg - 35 + i * 5, 500)), home];
    L.polygon(wedge, { color: '#4e8676', weight: 1.5, dashArray: '5 5', fillColor: '#7fb39b', fillOpacity: .12, interactive: false }).addTo(m.layer);
    L.marker(destination(home, w.fromDeg, 540), { interactive: false, icon: L.divIcon({ className: '', iconSize: null, html: `<span class="wedge-label">${copy.wedge} · ${safeText(w.fromCompass)}</span>` }) }).addTo(m.layer);
    bounds = L.latLngBounds(wedge).pad(.12);
  }
  (fires?.points || []).forEach(([lat, lon, frp, conf, time]) => L.circleMarker([lat, lon], { radius: Math.min(7, 2 + Math.sqrt(frp) / 2.5), stroke: false, fillColor: frp < 10 ? '#f2b33d' : frp < 50 ? '#e8743b' : '#b8261f', fillOpacity: .75 })
    .bindPopup(`<b>${frp} MW</b> · ${safeText(time)} UTC<br><small>VIIRS · ${conf === 'h' ? 'high' : 'nominal'} confidence</small>`).addTo(m.layer));
  L.marker(home, { icon: homeIcon(), title: selectedLocation.name }).addTo(m.layer);
  m.bounds = bounds;
  refreshMaps();
}

// Overview: past days of ERA5 weather next to CAMS PM2.5, loaded only when the page is open.
let historyDays = 30;
const historyCache = new Map();
function historyHead(copy) {
  const q = `lat=${encodeURIComponent(selectedLocation.latitude)}&lon=${encodeURIComponent(selectedLocation.longitude)}&days=${historyDays}`;
  return `<div class="card-top"><div><div class="section-kicker">${copy.histKicker}</div><h2>${copy.histTitle(historyDays)}</h2></div><div class="hist-actions"><div class="seg" role="group">${[30, 90].map(d => `<button type="button" data-days="${d}" class="${d === historyDays ? 'on' : ''}" aria-pressed="${d === historyDays}">${d}d</button>`).join('')}</div><a class="csv-link" href="${API_BASE}/v1/history?${q}&format=csv" download>${copy.csv}</a></div></div>`;
}

async function loadHistory() {
  const card = document.querySelector('.history-card');
  if (!API_BASE || document.getElementById('overview').hidden) return;
  const key = `${selectedLocation.latitude},${selectedLocation.longitude},${historyDays}`;
  if (card.dataset.key === key) return;
  card.dataset.key = key;
  const copy = ui();
  if (!historyCache.has(key)) {
    card.innerHTML = `${historyHead(copy)}<p class="muted hist-msg">${copy.histLoading}</p>`;
    try {
      const result = await fetch(`${API_BASE}/v1/history?lat=${encodeURIComponent(selectedLocation.latitude)}&lon=${encodeURIComponent(selectedLocation.longitude)}&days=${historyDays}`);
      if (!result.ok) throw new Error();
      historyCache.set(key, await result.json());
    } catch {
      if (card.dataset.key === key) { card.dataset.key = ''; card.innerHTML = `${historyHead(copy)}<p class="muted hist-msg">${copy.histFailed}</p>`; }
      return;
    }
    if (card.dataset.key !== key) return;
  }
  const h = historyCache.get(key), rows = h.rows, b = h.backtest;
  const pmMax = Math.max(50, ...rows.map(r => r.pm2_5 || 0)), viMax = Math.max(8000, ...rows.map(r => r.ventilation || 0)), bw = 720 / Math.max(1, rows.length);
  const y = (v, max) => (150 - v / max * 140).toFixed(1);
  const bars = rows.map((r, i) => Number.isFinite(r.pm2_5) ? `<rect x="${(i * bw + bw * .15).toFixed(1)}" width="${(bw * .7).toFixed(1)}" y="${y(r.pm2_5, pmMax)}" height="${(r.pm2_5 / pmMax * 140).toFixed(1)}" fill="${bandOf(r.pm2_5)[1]}" rx="1.5"/>` : '').join('');
  const line = rows.map((r, i) => Number.isFinite(r.ventilation) ? `${(i * bw + bw / 2).toFixed(1)},${y(r.ventilation, viMax)}` : '').filter(Boolean).join(' ');
  card.innerHTML = `${historyHead(copy)}<svg class="hist-chart" viewBox="0 0 720 152" preserveAspectRatio="none" role="img" aria-label="${copy.histLegend.join(', ')}">${bars}<line x1="0" x2="720" y1="${y(6000, viMax)}" y2="${y(6000, viMax)}" class="vi-threshold"/><polyline points="${line}" class="vi-line"/></svg>
    <div class="hist-axis"><span>${rows[0]?.date || ''}</span><span>${rows[rows.length >> 1]?.date || ''}</span><span>${rows.at(-1)?.date || ''}</span></div>
    <div class="hist-legend"><span><i class="bar"></i>${copy.histLegend[0]} · max ${Math.round(pmMax)}</span><span><i class="line"></i>${copy.histLegend[1]}</span><span><i class="dash"></i>6000 m²/s</span></div>
    ${b.days ? `<p class="hist-backtest">${copy.histBacktest(b.poorVentilationDays, b.days, b.meanPm2_5PoorVentilation, b.meanPm2_5GoodVentilation)}${b.correlationVentilationPm2_5 != null ? ` ${copy.histCorr(b.correlationVentilationPm2_5)}` : ''}</p>` : ''}<div class="hist-explain explain-box"><p class="muted">${copy.explainLoading}</p></div><small class="muted hist-note">${safeText(h.note)}</small>`;
  const svg = card.querySelector('.hist-chart');
  const tipFor = (i, a) => { const r = rows[i]; return `<b>${r.date}</b>PM2.5 ${r.pm2_5 ?? '—'} µg/m³ · ${r.ventilation ?? '—'} m²/s${r.precipitationMm ? ` · ${r.precipitationMm} mm` : ''}${a ? `<small>${safeText(a.note)}</small>` : ''}`; };
  chartTip(svg, rows.length, i => tipFor(i), true);
  const result = await loadExplain('history', historyDays);
  if (card.dataset.key !== key) return;
  card.querySelector('.hist-explain').innerHTML = explainHtml(result, copy, d => d);
  const byDate = new Map((result?.anomalies || []).map(a => [a.time, a]));
  rows.forEach((r, i) => { const a = byDate.get(r.date); if (a && Number.isFinite(r.pm2_5)) svg.insertAdjacentHTML('beforeend', dot(i * bw + bw / 2, y(r.pm2_5, pmMax) - 6, a.kind)); });
  chartTip(svg, rows.length, i => tipFor(i, byDate.get(rows[i].date)), true);
}

// Overview: Delhi ward GNN forecast (hourly container Lambda); shown only when you are within 6 km of a ward centroid.
let wardToken = 0;
async function loadWard() {
  const card = document.querySelector('.ward-card');
  const token = ++wardToken;
  card.hidden = true;
  if (!API_BASE || !inNcr()) return;
  try {
    const result = await fetch(`${API_BASE}/v1/ward-forecast?lat=${encodeURIComponent(selectedLocation.latitude)}&lon=${encodeURIComponent(selectedLocation.longitude)}`);
    const data = await result.json();
    if (token !== wardToken || data.state !== 'available' || !data.nearest) return;
    const copy = ui(), lang = langKey(), w = data.nearest;
    const cells = Object.entries(w.aqi).map(([h, [low, mid, high]]) => {
      const band = AQI_BANDS.find(b => mid <= b[0]) || AQI_BANDS.at(-1);
      return `<div class="ward-cell" style="--band:${BANDS[band[1]][1]}"><small>${copy.outlookL(h)}</small><b>${mid}</b><span>${low}–${high}</span><small>${BANDS[band[1]][lang === 'hi' ? 3 : 2]}</small></div>`;
    }).join('');
    card.innerHTML = `<div class="section-kicker">${copy.wardKicker}</div><h3>${safeText(copy.wardTitle(w.name))}</h3><p class="muted">${safeText(copy.wardBody(w.distanceKm))}</p><div class="ward-grid">${cells}</div><small class="muted">${copy.wardNote}${data.generatedAt ? ` · ${safeText(String(data.generatedAt).slice(0, 16).replace('T', ' '))} UTC` : ''}</small>`;
    card.hidden = false;
  } catch { /* the card stays hidden */ }
}
// AQI upper bounds mapped to BANDS rows (CPCB 50/100/200/300/400/500).
const AQI_BANDS = [[50, 0], [100, 1], [200, 2], [300, 3], [400, 4], [Infinity, 5]];

function renderSchematicMap(stations = []) {
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

// Hover/tap read-out for an SVG chart 720 units wide holding n evenly spaced items (bars when centred).
function chartTip(svg, n, html, centred = false) {
  const wrap = svg.parentElement;
  let tip = wrap.querySelector('.chart-tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; wrap.append(tip); }
  let cursor = svg.querySelector('.chart-cursor');
  if (!cursor) { svg.insertAdjacentHTML('beforeend', '<path class="chart-cursor" vector-effect="non-scaling-stroke"/>'); cursor = svg.querySelector('.chart-cursor'); }
  const move = event => {
    const r = svg.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
    const i = centred ? Math.min(n - 1, Math.floor(f * n)) : Math.round(f * (n - 1));
    const x = centred ? (i + .5) / n : n === 1 ? 0 : i / (n - 1);
    cursor.setAttribute('d', `M${(x * 720).toFixed(1)} 0V${svg.viewBox.baseVal.height}`);
    tip.innerHTML = html(i);
    tip.hidden = false;
    tip.style.left = `${r.left - w.left + x * r.width}px`;
    tip.style.top = `${r.top - w.top}px`;
    tip.style.transform = `translate(${x < .2 ? '-12%' : x > .8 ? '-88%' : '-50%'}, calc(-100% - 6px))`;
  };
  svg.onpointermove = svg.onpointerdown = move;
  svg.onpointerleave = () => { tip.hidden = true; cursor.setAttribute('d', ''); };
}

// Unusual hours/days flagged by the API, explained by Bedrock (or weather rules when Bedrock is unavailable).
const explainCache = new Map();
function loadExplain(kind, days = 30) {
  const key = `${kind}:${days}:${currentLanguage}:${selectedLocation.latitude},${selectedLocation.longitude}`;
  if (!explainCache.has(key)) explainCache.set(key, fetch(`${API_BASE}/v1/explain?kind=${kind}&days=${days}&lang=${currentLanguage}&lat=${encodeURIComponent(selectedLocation.latitude)}&lon=${encodeURIComponent(selectedLocation.longitude)}&place=${encodeURIComponent(selectedLocation.name)}`)
    .then(r => r.ok ? r.json() : Promise.reject()).catch(() => { explainCache.delete(key); return null; }));
  return explainCache.get(key);
}

function explainHtml(result, copy, label) {
  if (!result) return '';
  const items = result.anomalies.map(a => `<li class="ex-${a.kind}"><b>${safeText(label(a.time))} · ${a.kind === 'spike' ? copy.spike : copy.dip} ${a.value} µg/m³</b> ${safeText(a.note)}</li>`).join('');
  return `<h4>${copy.explainTitle} <span class="mode-badge ${result.mode === 'bedrock' ? 'bedrock' : 'rules'}">${result.mode === 'bedrock' ? copy.viaBedrockShort : copy.viaRulesShort}</span></h4>${result.mode === 'bedrock' && result.summary ? `<p>${safeText(result.summary)}</p>` : ''}${items ? `<ul>${items}</ul>` : `<p class="muted">${copy.explainNone}</p>`}`;
}

// Zero-length round-capped stroke = a dot that stays round on a non-uniformly scaled chart.
const dot = (x, y, kind) => `<path class="anomaly-dot ${kind === 'spike' ? 'spike' : 'dip'}" d="M${(+x).toFixed(1)} ${(+y).toFixed(1)}h0" vector-effect="non-scaling-stroke"/>`;

let lastForecast = null;
async function renderForecastExplain(usable, coords) {
  const box = document.querySelector('.forecast-explain');
  const copy = ui(), svg = document.querySelector('.chart-svg');
  const tip = byTime => chartTip(svg, usable.length, i => { const p = usable[i], a = byTime.get(p.time); return `${copy.tipAt(formatTime(p.time), Math.round(p.pm2_5), p.aqi)}${a ? `<small>${safeText(a.note)}</small>` : ''}`; });
  svg.querySelectorAll('.anomaly-dot').forEach(el => el.remove());
  tip(new Map());
  box.innerHTML = `<p class="muted">${copy.explainLoading}</p>`;
  const result = API_BASE ? await loadExplain('forecast') : null;
  if (usable !== lastForecast) return;
  box.innerHTML = explainHtml(result, copy, formatTime);
  const byTime = new Map((result?.anomalies || []).map(a => [a.time, a]));
  usable.forEach((p, i) => { const a = byTime.get(p.time); if (a) svg.insertAdjacentHTML('beforeend', dot(coords[i][0], coords[i][1], a.kind)); });
  tip(byTime);
}

function renderForecast(points = []) {
  const usable = points.slice(0, 24).filter(point => Number.isFinite(point.pm2_5));
  if (!usable.length) return;
  lastForecast = usable;
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
  document.querySelector('.forecast-summary small').textContent = 'CAMS atmospheric composition forecast · hover or tap the line to read any hour';
  if (!document.querySelector('.forecast-explain')) document.querySelector('.forecast-summary').after(Object.assign(document.createElement('div'), { className: 'forecast-explain explain-box' }));
  renderForecastExplain(usable, coords);
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
      ${myConditions().filter(c => g.conditionActions?.[c]?.[lang]?.length).map(c => `<h4 class="advice-cond">${CONDITIONS[c].icon} ${safeText(CONDITIONS[c][lang])}</h4><ul class="advice-list">${g.conditionActions[c][lang].map(item => `<li>${safeText(item)}</li>`).join('')}</ul>`).join('')}
      ${window ? `<div class="advice-window"><span>☼</span><span><b>${formatTime(window.from)} – ${formatTime(window.to)}</b><small>${copy.cleanest} · ~${Math.round(window.avg)} µg/m³</small></span></div>` : ''}
      <blockquote class="advice-impact"><small>${copy.cpcbSays}</small>${safeText(g.band.impact[lang])}</blockquote>
      <div class="advice-source">${copy.notMedical} <span>·</span> <a href="${safeText(g.source.url)}" target="_blank" rel="noreferrer">CPCB ↗</a> <button type="button" class="text-button edit-profile">${copy.editProfile} ›</button></div>`;
    card.querySelector('.edit-profile').addEventListener('click', openProfile);
  }
  renderIndoor();
}

// Indoor tips: Saans has no indoor sensor, so tips follow the outdoor level, the pollutants that are up, and the person's conditions.
const INDOOR_TIPS = {
  purifier: ['🌀', ['Run a HEPA purifier where you sleep', 'Choose True HEPA (H13). Size it by CADR: at least ⅔ of the floor area in ft² (a 150 ft² bedroom needs ~100 cfm, about 170 m³/h). Keep the door shut while it runs, and skip ionisers or “ozone” purifiers.'],
    ['जहाँ सोते हैं वहाँ HEPA प्यूरीफ़ायर चलाएँ', 'True HEPA (H13) चुनें। CADR कमरे के क्षेत्रफल (ft²) का कम से कम ⅔ हो (150 ft² के बेडरूम के लिए ~100 cfm, लगभग 170 m³/घंटा)। चलते समय दरवाज़ा बंद रखें; आयनाइज़र या “ओज़ोन” वाले प्यूरीफ़ायर न लें।']],
  windows: ['🪟', ['Air the house only in the cleanest hours', at => `Keep windows shut while the air is poor${at ? `; open them for 10–15 minutes around ${at}, when the model expects the cleanest air` : ''}.`],
    ['घर में हवा सिर्फ़ साफ़ घंटों में आने दें', at => `हवा ख़राब हो तब खिड़कियाँ बंद रखें${at ? `; ${at} के आसपास 10–15 मिनट खोलें, जब मॉडल सबसे साफ़ हवा बताता है` : ''}।`]],
  smoke: ['🪔', ['No incense, mosquito coils or smoking indoors', 'Agarbatti, dhoop and coils release fine particles right where you breathe. Use a net or a plug-in repellent instead.'],
    ['घर में अगरबत्ती, मच्छर कॉइल या धूम्रपान नहीं', 'अगरबत्ती, धूप और कॉइल ठीक वहीं महीन कण छोड़ते हैं जहाँ आप साँस लेते हैं। मच्छरदानी या प्लग-इन रिपेलेंट इस्तेमाल करें।']],
  cooking: ['🍳', ['Run the chimney or exhaust fan while cooking', 'Gas, and even more so wood, coal or kerosene, adds PM2.5 and NO₂ indoors. Cover pots and keep the kitchen door closed.'],
    ['खाना बनाते समय चिमनी या एग्ज़ॉस्ट चलाएँ', 'गैस, और उससे ज़्यादा लकड़ी, कोयला या केरोसिन, घर में PM2.5 और NO₂ बढ़ाते हैं। बर्तन ढककर पकाएँ और रसोई का दरवाज़ा बंद रखें।']],
  dust: ['🧹', ['Wet-mop instead of sweeping', 'Dry sweeping lifts settled dust (PM10) back into the air. Use a damp mop, wipe surfaces, and keep a doormat at the door.'],
    ['झाड़ू की जगह गीला पोछा लगाएँ', 'सूखी झाड़ू जमी धूल (PM10) को फिर हवा में उड़ा देती है। गीला पोछा लगाएँ, सतहें पोंछें और दरवाज़े पर पायदान रखें।']],
  co: ['🔥', ['Never run an angithi, coal heater or generator in a closed room', 'They give off carbon monoxide, which has no smell and can kill in your sleep. Keep a window open if you must use one.'],
    ['बंद कमरे में अंगीठी, कोयला हीटर या जनरेटर कभी न चलाएँ', 'इनसे कार्बन मोनोऑक्साइड निकलती है, जिसकी गंध नहीं होती और जो नींद में जान ले सकती है। ज़रूरी हो तो खिड़की खुली रखें।']],
  ozone: ['☀', ['Stay in during the afternoon ozone peak', 'Ozone breaks down quickly indoors, so being inside between noon and 5 pm already helps. A purifier will not remove it; an activated-carbon filter helps a little.'],
    ['दोपहर में ओज़ोन के समय अंदर रहें', 'ओज़ोन घर के अंदर जल्दी टूट जाती है, इसलिए दोपहर 12 से 5 बजे अंदर रहना ही मदद करता है। HEPA इसे नहीं हटाता; एक्टिवेटेड-कार्बन फ़िल्टर थोड़ा मदद करता है।']],
  plants: ['🪴', ['Plants are nice, not a purifier', 'Money plant, snake plant, areca palm and peace lily take up small amounts of gases such as formaldehyde and benzene, but studies find a room would need hundreds of them to match one air change, and they do not remove PM2.5. Grow them for comfort; rely on a HEPA filter for particles.'],
    ['पौधे अच्छे हैं, पर प्यूरीफ़ायर नहीं', 'मनी प्लांट, स्नेक प्लांट, एरेका पाम और पीस लिली फ़ॉर्मल्डिहाइड और बेंज़ीन जैसी गैसें थोड़ी मात्रा में सोखते हैं, पर अध्ययनों के अनुसार एक कमरे में सैकड़ों पौधे चाहिए, और वे PM2.5 नहीं हटाते। सुकून के लिए लगाएँ; कणों के लिए HEPA फ़िल्टर पर भरोसा करें।']]
};

function renderIndoor() {
  const card = document.querySelector('.indoor-card');
  const copy = ui(), lang = langKey(), hi = lang === 'hi' ? 2 : 1;
  const pm = lastData?.estimate?.pm2_5, band = lastData?.guidance?.band.index ?? 0;
  const up = Object.fromEntries((lastData?.pollutants || []).map(p => [p.key, p.level.index]));
  const sensitive = myConditions().length > 0;
  const month = new Date().getMonth() + 1;
  const keys = [
    (band >= 2 || sensitive) && 'purifier', 'windows', 'smoke',
    (up.nitrogen_dioxide >= 2 || up.carbon_monoxide >= 2 || band >= 3) && 'cooking',
    (up.pm10 >= 2 || myConditions().includes('allergy')) && 'dust',
    (up.carbon_monoxide >= 2 || month >= 11 || month <= 2) && 'co',
    up.ozone >= 2 && 'ozone', 'plants', band < 2 && !sensitive && 'purifier'
  ].filter(Boolean);
  const best = cleanestWindow(lastData?.forecast);
  card.innerHTML = `<div class="section-kicker">${copy.indoorKicker}</div><h3>${copy.indoorTitle}</h3>${Number.isFinite(pm) ? `<p class="indoor-intro">${safeText(copy.indoorIntro(Math.round(pm)))}</p>` : ''}
    <ul class="indoor-list">${keys.map(key => { const [icon, ...text] = INDOOR_TIPS[key]; const [title, body] = text[hi - 1];
      return `<li><span class="indoor-icon" aria-hidden="true">${icon}</span><span><b>${safeText(title)}</b><small>${safeText(typeof body === 'function' ? body(best && formatTime(best.from)) : body)}</small></span></li>`; }).join('')}</ul>`;
}

// Today page: a headline card plus notification-style alerts built from live data for the chosen persona.
function briefingItems(data) {
  const copy = ui(), lang = langKey(), g = data.guidance, items = [];
  if (!g) return [{ tone: 'info', icon: 'ℹ', title: copy.noEstimate }];
  const tone = g.band.index >= 3 ? 'warn' : g.band.index === 2 ? 'caution' : 'ok';
  g.actions[selectedProfile][lang].forEach(action => items.push({ tone, icon: PERSONAS[selectedProfile].icon, title: action, tag: copy.forYou(personaLabel()) }));
  myConditions().forEach(c => (g.conditionActions?.[c]?.[lang] || []).forEach(action => items.push({ tone, icon: CONDITIONS[c].icon, title: action, tag: copy.condTag(CONDITIONS[c][lang]) })));
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
  (data.pollutants || []).filter(p => p.key !== 'pm2_5' && p.level.index >= 2 && affectsMe(p))
    .forEach(p => items.push({ tone: p.level.index >= 3 ? 'warn' : 'caution', icon: '⚗', title: copy.pollutantAlert(p.name, p.level.label[lang]), body: p.about[lang] }));
  const w = data.weather, fires = data.fires;
  if (w?.ventilation?.label === 'poor') {
    const best = bestMixing(w.hourly.slice(0, 24));
    items.push({ tone: 'caution', icon: '≋', title: copy.stagnant(Math.round(w.blhM)), body: copy.stagnantBody(w.ventilation.index.toLocaleString('en-IN'), best && formatTime(best.time)) });
  }
  if (fires?.state === 'available' && fires.count) items.push({ tone: fires.count >= 50 ? 'warn' : 'caution', icon: '🔥', title: copy.firesUp(fires.count), body: copy.firesUpBody(fires.topStates.map(s => s.state).join(', '), fires.nearestKm, w?.fromCompass || '') });
  else if (fires?.state !== 'available' && inNcr() && w && w.fromDeg >= 250 && w.fromDeg <= 350) items.push({ tone: 'caution', icon: '⌁', title: copy.ncrSmoke });
  if (data.estimate?.method === 'open_meteo_model') items.push({ tone: 'info', icon: 'ℹ', title: copy.modelNote });
  return items;
}

function renderBriefing() {
  const copy = ui(), lang = langKey();
  const headline = document.querySelector('.today-headline');
  const feed = document.querySelector('.briefing');
  const data = lastData;
  const persona = `<button type="button" class="persona-chip"><span aria-hidden="true">${PERSONAS[selectedProfile].icon}</span> ${copy.planningFor}: <b>${safeText(personaLabel())}</b> <u>${copy.change}</u></button>`;
  if (!data) {
    headline.innerHTML = `<div class="headline-card"><p class="headline-title">${copy.loading}</p>${persona}</div>`;
    feed.innerHTML = '';
  } else {
    const g = data.guidance, pm = data.estimate?.pm2_5, aqi = data.aqi;
    // Circle shows the indicative AQI; PM2.5 only when the API could not compute one.
    const circle = aqi ? `<span class="headline-pm" style="--band:${aqi.band.color}" title="${safeText(copy.aqiNote)}"><b>${aqi.value}</b><small>${copy.aqiCircle}</small><small class="aqi-dom">${safeText(copy.aqiMostly(aqi.dominantName || ''))}</small></span>`
      : `<span class="headline-pm"><b>${Number.isFinite(pm) ? Math.round(pm) : '—'}</b><small>PM2.5 µg/m³</small></span>`;
    const outlook = aqi?.outlook?.length ? `<div class="aqi-outlook">${aqi.outlook.map(o => `<span style="--band:${o.band.color}"><small>${copy.outlookL(o.hours)}</small><b>${o.aqi}</b><small>${o.low}–${o.high}</small></span>`).join('')}</div>` : '';
    headline.innerHTML = `<div class="headline-card" style="--band:${(aqi?.band || g?.band)?.color || '#9aa'}"><div class="headline-main">${circle}<div><p class="headline-title">${g ? safeText(copy.headline((aqi?.band || g.band).label[lang], selectedLocation.name)) : copy.noEstimate}</p>${g ? `<p class="headline-impact">${safeText((aqi?.band || g.band).impact[lang])}</p><small class="headline-note">${aqi ? copy.aqiNote : copy.bandSuffix}</small>` : ''}${outlook}</div></div>${persona}</div>`;
    feed.innerHTML = briefingItems(data).map(item => `<div class="alert alert-${item.tone}"><span class="alert-icon" aria-hidden="true">${item.icon}</span><div>${item.tag ? `<small class="alert-tag">${safeText(item.tag)}</small>` : ''}<b>${safeText(item.title)}</b>${item.body ? `<p>${safeText(item.body)}</p>` : ''}</div></div>`).join('') + `<a class="alert-more" href="#health">${copy.seeGuidance}</a>`;
  }
  headline.querySelector('.persona-chip').addEventListener('click', openProfile);
  renderPollutants();
}

function renderPollutants() {
  const copy = ui(), lang = langKey();
  const list = lastData?.pollutants || [];
  document.querySelector('.pollutant-section').innerHTML = list.length ? `<h3>${copy.pollutantsTitle}</h3><div class="pollutant-grid">${list.map(p => {
    const mine = affectsMe(p);
    return `<article class="pollutant-card${mine ? ' mine' : ''}"><div class="pollutant-top"><b>${safeText(p.name)}</b><span class="band-pill" style="--band:${p.level.color}"><i></i>${safeText(p.level.label[lang])}</span></div><div class="pollutant-value">${p.value}<small> ${safeText(p.unit)}</small></div><p>${safeText(p.about[lang])}</p>${mine ? `<span class="affects-you">${PERSONAS[selectedProfile].icon} ${copy.affectsYou}</span>` : ''}</article>`;
  }).join('')}</div><small class="pollutant-note">${copy.pollutantsNote}</small>` : '';
}

function renderPersonal() {
  renderGuidance();
  renderBriefing();
  renderHealth();
  renderMore();
  document.querySelector('.avatar').textContent = PERSONAS[selectedProfile].icon;
}

// More page: profile card summary and the health-profile row.
function renderMore() {
  const lang = langKey(), name = displayName();
  document.querySelector('.more-avatar').textContent = (name.trim()[0] || 'G').toUpperCase();
  document.querySelector('.more-name').textContent = name;
  document.querySelector('.more-sub').textContent = lang === 'hi' ? `पसंदीदा भाषा: हिन्दी · ${personaLabel()}` : `Preferred language: English · ${personaLabel()}`;
  const conds = myConditions().map(c => CONDITIONS[c][lang]);
  document.querySelector('.more-health-sub').textContent = `${PERSONAS[selectedProfile].icon} ${personaLabel()}${conds.length ? ` · ${conds.join(', ')}` : ''}`;
}

const arrow = (deg, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${(deg + 180) % 360}deg)" aria-hidden="true"><path d="M12 3v16m0-16-5 5m5-5 5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Daytime hour with the strongest vertical mixing in the next 24 hours.
const bestMixing = (hourly = []) => hourly.filter(h => Number.isFinite(h.ventilation) && +h.time.slice(11, 13) >= 6 && +h.time.slice(11, 13) <= 21)
  .reduce((best, h) => !best || h.ventilation > best.ventilation ? h : best, null);

function renderWeather() {
  const card = document.querySelector('.wind-card');
  const copy = ui(), w = lastData?.weather;
  if (!w || !Number.isFinite(w.fromDeg)) { card.innerHTML = `<span class="section-kicker">${copy.wxKicker}</span><p class="wind-note">${copy.windUnavailable}</p>`; return; }
  const fromNw = w.fromDeg >= 250 && w.fromDeg <= 350;
  const showNcr = inNcr() && lastData.fires?.state !== 'available';
  const vi = w.ventilation;
  const strip = w.hourly.filter((_, i) => i % 3 === 0).slice(0, 8).map(h => `<span class="wind-hour"><small>${formatTime(h.time)}</small>${arrow(h.fromDeg, 18)}<b>${h.speedKmh}</b><small class="blh">${h.blhM == null ? '' : `${Math.round(h.blhM)} m`}</small></span>`).join('');
  const tile = (label, value, extra = '') => `<div class="wx"><small>${label}</small><b>${value}</b>${extra}</div>`;
  card.innerHTML = `<div class="wind-main"><div class="wind-compass" aria-hidden="true"><span>N</span>${arrow(w.fromDeg, 54)}</div><div><span class="section-kicker">${copy.wxKicker}</span><h3>${copy.windTitle}</h3><p class="wind-now"><b>${copy.windFrom(w.fromCompass)}</b> · ${w.speedKmh} km/h${Number.isFinite(w.gustKmh) ? ` · ${copy.gusts} ${w.gustKmh} km/h` : ''}</p>${showNcr ? `<p class="wind-note ${fromNw ? 'warn' : ''}">${fromNw ? copy.ncrSmoke : copy.ncrClear}</p>` : ''}</div></div>
    <div class="wx-grid">${tile(copy.tempL, Number.isFinite(w.temperatureC) ? `${Math.round(w.temperatureC)}°C` : '—')}${tile(copy.humidL, Number.isFinite(w.humidity) ? `${w.humidity}%` : '—')}${tile(copy.blhL, Number.isFinite(w.blhM) ? `${Math.round(w.blhM)} m` : '—')}${tile(copy.viL, vi ? `${vi.index.toLocaleString('en-IN')} m²/s` : '—', vi ? `<span class="vi-chip vi-${vi.label}">${copy.vi[vi.label]}</span>` : '')}</div>
    <p class="wx-explain">${copy.viExplain}</p>
    <div class="wind-strip" aria-label="${copy.next24}"><span class="wind-strip-label">${copy.next24} · km/h · m = ${copy.blhL.toLowerCase()}</span>${strip}</div>`;
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
  renderBandLegend();
  renderForecast(data.forecast);
  loadWard();
  renderPersonal();
  renderWeather();
  loadFires();
  document.querySelector('.history-card').dataset.key = '';
  loadHistory();
  const fireSource = document.getElementById('fireSource');
  fireSource.textContent = data.sources?.fires === 'available' ? 'NASA FIRMS ↗' : data.sources?.fires === 'not_configured' ? 'MAP_KEY needed' : 'Unavailable';
  fireSource.className = data.sources?.fires === 'available' ? '' : 'coming-soon';
  document.querySelector('.page-footer > span:last-child').innerHTML = `${safeText(data.disclaimer)} <i>·</i> <a href="https://docs.openaq.org/" target="_blank" rel="noreferrer">OpenAQ source ↗</a> <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo source ↗</a> <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noreferrer">NASA FIRMS ↗</a>`;
  setStatus(data.cache === 'stale' ? 'CACHED DATA' : 'LIVE DATA', data.cache === 'stale' ? 'warn' : 'ok');
}

let loadToken = 0;
async function loadAir() {
  const token = ++loadToken;
  document.querySelector('.local-card strong').textContent = selectedLocation.name;
  document.querySelector('.local-card div:nth-child(2) .tiny:last-child').textContent = selectedLocation.geo ? ui().deviceLocation : selectedLocation.label || 'India · selected area';
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

// Multi-turn chat: the last turns go to the API so follow-ups ("and tomorrow?") keep their context. Reset on location change.
let chatHistory = [];
function resetChat() {
  chatHistory = [];
  response.classList.remove('show');
  response.replaceChildren();
}
async function ask(question) {
  question = question.trim().slice(0, 300);
  if (!question || !API_BASE) return;
  const copy = ui(), input = document.getElementById('chatInput'), send = document.querySelector('#chatForm button');
  response.classList.add('show');
  if (!response.querySelector('.chat-reset')) response.insertAdjacentHTML('afterbegin', `<button type="button" class="text-button chat-reset">↺ ${copy.newChat}</button>`);
  response.insertAdjacentHTML('beforeend', `<div class="chat-turn"><p class="chat-q"><b>${copy.you}:</b> ${safeText(question)}</p><p class="chat-a pending">${copy.thinking}</p></div>`);
  const turn = response.lastElementChild;
  turn.scrollIntoView({ block: 'nearest' });
  input.value = '';
  input.disabled = send.disabled = true;
  try {
    const result = await fetch(`${API_BASE}/v1/ask`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, lat: selectedLocation.latitude, lon: selectedLocation.longitude, profile: selectedProfile, conditions: myConditions(), lang: currentLanguage, place: selectedLocation.name, history: chatHistory.slice(-8) }) });
    const data = await result.json();
    if (!result.ok) throw new Error(data.message);
    chatHistory.push({ role: 'user', text: question }, { role: 'assistant', text: data.answer });
    turn.querySelector('.chat-a').outerHTML = `<p class="chat-a">${safeText(data.answer)}</p><div class="chat-sources">${data.sources.map(s => `<a href="${safeText(s.url)}" target="_blank" rel="noreferrer">${safeText(s.label)} ↗</a>`).join('')}</div><small class="chat-mode">${data.mode === 'bedrock' ? copy.viaBedrock : copy.viaRules}</small>`;
  } catch {
    turn.querySelector('.chat-a').outerHTML = `<p class="chat-a">${copy.askFailed}</p>`;
  } finally {
    input.disabled = send.disabled = false;
    input.focus();
    turn.scrollIntoView({ block: 'nearest' });
  }
}
response.addEventListener('click', event => { if (event.target.closest('.chat-reset')) resetChat(); });

// Searched places and cities persist on this device; a shared device location is never stored.
function setLocation(location) {
  selectedLocation = location;
  citySelect.value = INDIA_CITIES.some(city => city.name === location.name) ? location.name : '';
  try {
    localStorage.removeItem('saans-city');
    if (location.geo) localStorage.removeItem('saans-location');
    else localStorage.setItem('saans-location', JSON.stringify({ name: location.name, latitude: location.latitude, longitude: location.longitude, label: location.label || '' }));
  } catch { /* session only */ }
  document.getElementById('settingsLocation').textContent = location.geo ? ui().deviceLocation : location.label || `${location.name} · India`;
  resetChat();
  loadAir();
}

function chooseCurrentLocation() {
  if (!navigator.geolocation) { toast('Location is not supported in this browser.'); return; }
  navigator.geolocation.getCurrentPosition(
    position => setLocation({ name: 'My location', latitude: position.coords.latitude, longitude: position.coords.longitude, geo: true }),
    () => toast('Location permission was not granted. Search for your area or choose a city instead.'),
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
}

// Header location control: search any Indian locality (Open-Meteo geocoding through the API), share device location, or pick a city.
const cityOptions = () => INDIA_CITIES.map(city => `<option value="${safeText(city.name)}">${safeText(city.name)}</option>`).join('');
const locationPill = document.createElement('div');
locationPill.className = 'location-select loc-wrap';
locationPill.innerHTML = `<button type="button" class="loc-button" aria-haspopup="dialog" aria-expanded="false"><span class="pin">⌖</span> <span class="location-name">${safeText(selectedLocation.name)}</span> <span class="chevron">⌄</span></button><div class="loc-pop" role="dialog" aria-label="Choose location" hidden><input type="search" class="loc-search" autocomplete="off" spellcheck="false" maxlength="60" aria-label="Search location"/><button type="button" class="loc-geo"></button><div class="loc-results" role="listbox"></div></div>`;
document.querySelector('.location-select').replaceWith(locationPill);
const locationButton = locationPill.querySelector('.loc-button');
const locationPop = locationPill.querySelector('.loc-pop');
const locationSearch = locationPill.querySelector('.loc-search');
const locationResults = locationPill.querySelector('.loc-results');
let locationMatches = [];
function showPlaces(places, heading) {
  locationMatches = places;
  locationResults.innerHTML = places.length ? `<span class="loc-heading">${heading}</span>${places.map((place, i) => `<button type="button" role="option" class="loc-option" data-i="${i}"><b>${safeText(place.name)}</b>${place.label && place.label !== place.name ? `<small>${safeText(place.label)}</small>` : ''}</button>`).join('')}` : `<p class="loc-empty">${ui().noResults}</p>`;
}
function toggleLocationPop(open = locationPop.hidden) {
  locationPop.hidden = !open;
  locationButton.setAttribute('aria-expanded', String(open));
  if (!open) return;
  locationSearch.value = '';
  locationSearch.placeholder = ui().searchPlaceholder;
  locationPill.querySelector('.loc-geo').textContent = ui().useMyLocation;
  showPlaces(INDIA_CITIES, ui().cities);
  locationSearch.focus();
}
const pickPlace = place => { toggleLocationPop(false); setLocation(place); };
let searchTimer, searchToken = 0;
locationSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = locationSearch.value.trim();
  if (q.length < 2 || !API_BASE) { showPlaces(INDIA_CITIES.filter(city => city.name.toLowerCase().includes(q.toLowerCase())), ui().cities); return; }
  searchTimer = setTimeout(async () => {
    const token = ++searchToken;
    try {
      const result = await fetch(`${API_BASE}/v1/geocode?q=${encodeURIComponent(q)}`);
      const data = await result.json();
      if (token === searchToken) showPlaces(result.ok ? data.results : [], ui().results);
    } catch { if (token === searchToken) showPlaces([], ui().results); }
  }, 300);
});
locationSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') { toggleLocationPop(false); locationButton.focus(); }
  if (event.key === 'Enter' && locationMatches[0]) { event.preventDefault(); pickPlace(locationMatches[0]); }
});
locationResults.addEventListener('click', event => { const option = event.target.closest('.loc-option'); if (option) pickPlace(locationMatches[Number(option.dataset.i)]); });
locationPill.querySelector('.loc-geo').addEventListener('click', () => { toggleLocationPop(false); chooseCurrentLocation(); });
locationButton.addEventListener('click', () => toggleLocationPop());
document.addEventListener('click', event => { if (!locationPop.hidden && !locationPill.contains(event.target)) toggleLocationPop(false); });

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

// Name screen health-condition question: No / Yes, then pick any that apply.
const conditionField = document.getElementById('conditionField');
let pendingConditions = myConditions();
let conditionYes = pendingConditions.length > 0;
function renderConditionField() {
  const hi = langKey() === 'hi';
  conditionField.innerHTML = `<legend>${hi ? 'कोई स्वास्थ्य समस्या?' : 'ANY HEALTH CONDITION?'}</legend><div class="cond-toggle" role="radiogroup">${[[false, hi ? 'नहीं' : 'No'], [true, hi ? 'हाँ' : 'Yes']].map(([v, label]) => `<button type="button" role="radio" data-yes="${v}" aria-checked="${conditionYes === v}" class="${conditionYes === v ? 'selected' : ''}">${label}</button>`).join('')}</div>${conditionYes ? `<div class="cond-chips">${Object.entries(CONDITIONS).map(([key, c]) => `<button type="button" data-cond="${key}" aria-pressed="${pendingConditions.includes(key)}" class="${pendingConditions.includes(key) ? 'selected' : ''}"><span aria-hidden="true">${c.icon}</span> ${safeText(c[hi ? 'hi' : 'en'])}</button>`).join('')}</div><small class="cond-note">${hi ? 'जितने लागू हों चुनें। यह सिर्फ़ इसी डिवाइस पर रहता है।' : 'Pick all that apply. This stays on this device only.'}</small>` : ''}`;
}
conditionField.addEventListener('click', event => {
  const yes = event.target.closest('[data-yes]'), chip = event.target.closest('[data-cond]');
  if (yes) conditionYes = yes.dataset.yes === 'true';
  if (chip) pendingConditions = pendingConditions.includes(chip.dataset.cond) ? pendingConditions.filter(c => c !== chip.dataset.cond) : [...pendingConditions, chip.dataset.cond];
  if (yes || chip) renderConditionField();
});
function saveConditions() {
  selectedConditions = conditionYes ? pendingConditions.filter(c => c in CONDITIONS) : [];
  try { localStorage.setItem('saans-conditions', JSON.stringify(selectedConditions)); } catch { /* session only */ }
}

// Leave the app for the name screen (or the welcome screen) to edit name, persona and conditions.
function openProfile(welcome = false) {
  renaming = true;
  pendingPersona = selectedProfile;
  pendingConditions = myConditions();
  conditionYes = pendingConditions.length > 0;
  renderPersonaGrid();
  renderConditionField();
  document.querySelector('.app-shell').hidden = true;
  document.querySelector('.mobile-nav').hidden = true;
  document.getElementById('chatFab').hidden = true;
  document.getElementById('chatPanel').hidden = true;
  document.body.classList.remove('in-app');
  const input = document.getElementById('nameInput');
  input.value = displayName();
  window.scrollTo(0, 0);
  if (welcome === true) { document.getElementById('welcomeScreen').hidden = false; return; }
  document.getElementById('nameScreen').hidden = false;
  input.select();
}

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
  saveConditions();
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
  const saved = JSON.parse(localStorage.getItem('saans-location') || 'null');
  const savedCity = INDIA_CITIES.find(city => city.name === localStorage.getItem('saans-city')); // older installs
  if (saved && typeof saved.name === 'string' && Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude) && Math.abs(saved.latitude) <= 90 && Math.abs(saved.longitude) <= 180)
    selectedLocation = { name: saved.name.slice(0, 60), latitude: saved.latitude, longitude: saved.longitude, label: String(saved.label || '').slice(0, 120) };
  else if (savedCity) selectedLocation = savedCity;
} catch { /* retain the India default */ }
citySelect.value = INDIA_CITIES.some(city => city.name === selectedLocation.name) ? selectedLocation.name : '';
citySelect.addEventListener('change', () => {
  const city = INDIA_CITIES.find(item => item.name === citySelect.value);
  if (city) setLocation(city);
});
document.querySelector('.local-card .dots').addEventListener('click', () => {
  location.hash = '#more';
  citySelect.focus({ preventScroll: true });
});
document.querySelector('.profile-button').addEventListener('click', () => openProfile());
document.getElementById('moreProfile').addEventListener('click', () => openProfile());
document.getElementById('moreHealth').addEventListener('click', () => openProfile());
document.getElementById('replayWelcome').addEventListener('click', () => openProfile(true));
const translations = {
  en: { welcomeTitle: 'Know the air.<br><em>Find your next breath.</em>', welcomeDesc: 'Saans brings together nearby monitors, weather and smoke movement to make the air around you easier to understand — starting with communities across India.', next: 'Next', featureTitle: 'Understand the air where you live in India.', airTile: 'See what’s in the air', watchTile: 'Follow what’s moving', guideTile: 'Make it personal', chatTile: 'Ask in your own words', healthProfile: 'Health profile', replay: 'Replay welcome', language: 'Language', location: 'Location', city: 'Indian city', reduceMotion: 'Reduce motion', howTo: 'How to use Saans', dataPrivacy: 'Data and privacy', nameTitle: 'Who is Saans<br><em>planning for?</em>', personaLegend: 'WHO ARE YOU PLANNING FOR?', enter: 'Enter Saans' },
  hi: { welcomeTitle: 'हवा को जानें।<br><em>अपनी अगली साँस को समझें।</em>', welcomeDesc: 'Saans आसपास के मॉनिटर, मौसम और धुएँ की दिशा को जोड़ता है — भारत के शहरों और समुदायों के लिए।', next: 'आगे', featureTitle: 'भारत में अपने शहर की हवा को समझें।', airTile: 'हवा में क्या है', watchTile: 'हवा की दिशा देखें', guideTile: 'आपके परिवार के लिए', chatTile: 'अपने शब्दों में पूछें', healthProfile: 'स्वास्थ्य प्रोफ़ाइल', replay: 'परिचय फिर देखें', language: 'भाषा', location: 'स्थान', city: 'भारतीय शहर', reduceMotion: 'गतिशीलता कम करें', howTo: 'Saans का उपयोग कैसे करें', dataPrivacy: 'डेटा और गोपनीयता', nameTitle: 'Saans किसके लिए<br><em>योजना बनाए?</em>', personaLegend: 'आप किसके लिए योजना बना रहे हैं?', enter: 'Saans खोलें' }
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
  document.querySelector('.help-card summary b').textContent = copy.howTo;
  document.querySelector('.sources-card summary b').textContent = copy.dataPrivacy;
  document.querySelector('#moreHealth b').textContent = copy.healthProfile;
  document.querySelector('#replayWelcome b').textContent = copy.replay;
  document.querySelector('label[for="languageSelect"] b').textContent = copy.language;
  document.querySelector('#useCurrentLocation b').textContent = copy.location;
  document.querySelector('label[for="citySelect"] b').textContent = copy.city;
  document.querySelector('.motion-setting b').textContent = copy.reduceMotion;
  document.querySelector('.name-card h1').innerHTML = copy.nameTitle;
  document.querySelector('.persona-field legend').textContent = copy.personaLegend;
  document.querySelector('.enter-button').innerHTML = `${copy.enter} <span>→</span>`;
  if (!document.getElementById('chatInput').disabled) document.getElementById('chatInput').placeholder = ui().askPlaceholder;
  renderPersonaGrid();
  renderConditionField();
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
