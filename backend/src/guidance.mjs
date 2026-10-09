// PM2.5 bands use CPCB National AQI breakpoints for PM2.5 (24-hour average, µg/m³).
// Applying them to a current estimate is indicative only; Saans does not compute the official AQI.
// Impact text follows CPCB's published "possible health impacts" per category.
export const CPCB_SOURCE = { label: 'CPCB National AQI (PM2.5 breakpoints & health impacts)', url: 'https://cpcb.nic.in/displaypdf.php?id=bmF0aW9uYWwtYWlyLXF1YWxpdHktaW5kZXgvQWJvdXRfQVFJLnBkZg' };

const BANDS = [
  { key: 'good', max: 30, color: '#3f9b6b', label: { en: 'Good', hi: 'अच्छा' },
    impact: { en: 'Minimal impact.', hi: 'न्यूनतम प्रभाव।' } },
  { key: 'satisfactory', max: 60, color: '#8bb35a', label: { en: 'Satisfactory', hi: 'संतोषजनक' },
    impact: { en: 'Minor breathing discomfort to sensitive people.', hi: 'संवेदनशील लोगों को साँस लेने में हल्की तकलीफ़ हो सकती है।' } },
  { key: 'moderate', max: 90, color: '#d9a93c', label: { en: 'Moderate', hi: 'मध्यम' },
    impact: { en: 'Breathing discomfort to people with lung disease such as asthma, and discomfort to people with heart disease, children and older adults.', hi: 'अस्थमा जैसे फेफड़ों के रोग वाले लोगों को साँस में तकलीफ़, तथा हृदय रोगियों, बच्चों और बुज़ुर्गों को असुविधा हो सकती है।' } },
  { key: 'poor', max: 120, color: '#d9793c', label: { en: 'Poor', hi: 'ख़राब' },
    impact: { en: 'Breathing discomfort to people on prolonged exposure, and discomfort to people with heart disease.', hi: 'लंबे समय तक संपर्क में रहने पर लोगों को साँस में तकलीफ़, और हृदय रोगियों को असुविधा हो सकती है।' } },
  { key: 'very_poor', max: 250, color: '#c2453a', label: { en: 'Very poor', hi: 'बहुत ख़राब' },
    impact: { en: 'Respiratory illness on prolonged exposure. Effects may be more pronounced in people with lung and heart diseases.', hi: 'लंबे संपर्क से साँस की बीमारी हो सकती है। फेफड़े और हृदय रोगियों पर असर अधिक हो सकता है।' } },
  { key: 'severe', max: Infinity, color: '#7d2a3a', label: { en: 'Severe', hi: 'गंभीर' },
    impact: { en: 'Respiratory effects even on healthy people, and serious health impacts on people with lung or heart disease. Effects may be felt even during light physical activity.', hi: 'स्वस्थ लोगों पर भी साँस संबंधी असर, और फेफड़े या हृदय रोगियों पर गंभीर प्रभाव। हल्की गतिविधि में भी असर महसूस हो सकता है।' } }
];

// Practical, non-clinical steps. [general, sensitive] per band; sensitive applies to the SENSITIVE personas below.
const ACTIONS = [
  [{ en: ['A good time for outdoor activity.', 'Open windows to air out your home.'], hi: ['बाहर की गतिविधियों के लिए अच्छा समय है।', 'घर में ताज़ी हवा आने दें।'] },
   { en: ['Outdoor activity is fine.', 'Keep any prescribed inhaler with you as usual.'], hi: ['बाहर जाना ठीक है।', 'डॉक्टर द्वारा दी गई इनहेलर हमेशा की तरह साथ रखें।'] }],
  [{ en: ['Outdoor activity is fine for most people.'], hi: ['अधिकांश लोगों के लिए बाहर जाना ठीक है।'] },
   { en: ['Outdoor activity is generally fine.', 'Take breaks if you notice coughing or breathlessness.'], hi: ['बाहर जाना सामान्यतः ठीक है।', 'खाँसी या साँस फूलने पर आराम करें।'] }],
  [{ en: ['Most people can continue normal activities.', 'Consider shorter or lighter outdoor workouts.'], hi: ['अधिकांश लोग सामान्य काम जारी रख सकते हैं।', 'बाहर व्यायाम छोटा या हल्का रखें।'] },
   { en: ['Reduce long or intense outdoor exertion.', 'Keep reliever medicines handy if prescribed.'], hi: ['बाहर लंबी या भारी मेहनत कम करें।', 'डॉक्टर द्वारा दी गई दवा पास रखें।'] }],
  [{ en: ['Reduce prolonged or heavy outdoor exertion.', 'Prefer indoor exercise today.', 'Keep windows closed during peak hours.'], hi: ['बाहर लंबी या भारी मेहनत कम करें।', 'आज घर के अंदर व्यायाम करें।', 'प्रदूषण के चरम समय खिड़कियाँ बंद रखें।'] },
   { en: ['Avoid prolonged outdoor exertion.', 'A well-fitted N95/FFP2 mask helps if you must go out.', 'Follow your doctor’s action plan if you have one.'], hi: ['बाहर लंबी मेहनत से बचें।', 'बाहर जाना ज़रूरी हो तो अच्छी तरह फिट N95 मास्क पहनें।', 'यदि डॉक्टर की कार्ययोजना है तो उसका पालन करें।'] }],
  [{ en: ['Avoid prolonged outdoor exertion.', 'Wear a well-fitted N95 mask outdoors.', 'Use an air purifier indoors if available.'], hi: ['बाहर लंबी मेहनत से बचें।', 'बाहर अच्छी तरह फिट N95 मास्क पहनें।', 'उपलब्ध हो तो घर में एयर प्यूरीफ़ायर चलाएँ।'] },
   { en: ['Stay indoors as much as possible.', 'Avoid all outdoor exertion.', 'Seek medical help if symptoms get worse.'], hi: ['जितना हो सके घर के अंदर रहें।', 'बाहर किसी भी मेहनत से बचें।', 'लक्षण बढ़ें तो डॉक्टर से संपर्क करें।'] }],
  [{ en: ['Avoid outdoor physical activity.', 'Wear an N95 mask outdoors and keep windows closed.', 'Run an air purifier if available.'], hi: ['बाहर शारीरिक गतिविधि से बचें।', 'बाहर N95 मास्क पहनें और खिड़कियाँ बंद रखें।', 'उपलब्ध हो तो एयर प्यूरीफ़ायर चलाएँ।'] },
   { en: ['Stay indoors and avoid exertion.', 'Seek medical care promptly for breathing difficulty or chest pain.'], hi: ['घर के अंदर रहें और मेहनत से बचें।', 'साँस लेने में कठिनाई या सीने में दर्द हो तो तुरंत चिकित्सा सहायता लें।'] }]
];
// Personas: who the user is planning for. Extras are [from band index, en, hi], added on top of the base set.
const SENSITIVE = ['children', 'older', 'pregnant', 'heart_lung'];
const EXTRAS = {
  outdoor_worker: [
    [2, 'Take short breaks away from dust and traffic every hour or two.', 'हर एक-दो घंटे में धूल और ट्रैफ़िक से दूर थोड़ा आराम करें।'],
    [0, 'Heavy work makes you breathe in more air: keep dusty work wet (spray water) and cover sand and debris piles.', 'भारी काम में साँस ज़्यादा चलती है: धूल वाले काम पर पानी छिड़कें और रेत व मलबे के ढेर ढक कर रखें।'],
    [3, 'Wear a well-fitted N95 mask at work; cloth and surgical masks do little against fine dust.', 'काम पर अच्छी तरह फिट N95 मास्क पहनें; कपड़े या सर्जिकल मास्क बारीक धूल से कम बचाते हैं।'],
    [3, 'Do the heaviest tasks in the cleanest hours shown in Saans.', 'सबसे भारी काम Saans में दिखाए गए सबसे साफ़ समय में करें।'],
    [4, 'Ask your site supervisor about pausing heavy outdoor work.', 'भारी बाहरी काम रोकने के बारे में अपने सुपरवाइज़र से बात करें।']],
  commuter: [
    [1, 'Traffic exhaust is strongest at signals and in jams; keep a well-fitted mask handy for those stretches.', 'सिग्नल और जाम में वाहनों का धुआँ सबसे ज़्यादा होता है; उन रास्तों के लिए अच्छी तरह फिट मास्क पास रखें।'],
    [2, 'If you can, avoid the busiest roads and peak traffic hours.', 'हो सके तो सबसे व्यस्त सड़कों और ट्रैफ़िक के चरम समय से बचें।'],
    [3, 'Wear a well-fitted N95 mask while riding.', 'गाड़ी चलाते समय अच्छी तरह फिट N95 मास्क पहनें।'],
    [3, 'In a car, keep windows closed and set the AC to recirculate.', 'कार में खिड़कियाँ बंद रखें और AC को रीसर्कुलेट पर रखें।']],
  athlete: [
    [0, 'Run in parks or side streets rather than along busy roads; traffic pollution drops quickly away from them.', 'व्यस्त सड़कों के बजाय पार्कों या गलियों में दौड़ें; सड़क से दूर जाते ही ट्रैफ़िक प्रदूषण जल्दी घटता है।'],
    [2, 'Move runs and workouts indoors or to the cleanest hours.', 'दौड़ और व्यायाम घर के अंदर या सबसे साफ़ समय में करें।'],
    [3, 'Skip high-intensity training outdoors today.', 'आज बाहर तेज़ व्यायाम न करें।']],
  children: [
    [2, 'Keep outdoor play shorter and less intense.', 'बाहर खेल का समय छोटा और हल्का रखें।'],
    [3, 'Move outdoor play and school sport indoors.', 'बच्चों का खेल और स्कूल की खेल-गतिविधियाँ अंदर कराएँ।']],
  older: [
    [2, 'Take your walk later in the day, after the morning haze lifts, or walk indoors.', 'सुबह की धुंध छँटने के बाद टहलें, या घर के अंदर टहलें।'],
    [3, 'Keep regular medicines and a phone handy; tell family if you feel unwell.', 'नियमित दवाएँ और फ़ोन पास रखें; तबीयत ठीक न लगे तो परिवार को बताएँ।']],
  pregnant: [
    [2, 'Avoid long walks along busy roads.', 'व्यस्त सड़कों के किनारे लंबी सैर से बचें।'],
    [3, 'Rest in a room with windows closed, and speak to your doctor if you feel breathless or dizzy.', 'खिड़कियाँ बंद कमरे में आराम करें, और साँस फूलने या चक्कर आने पर डॉक्टर से बात करें।']],
  heart_lung: [
    [1, 'Carry your reliever inhaler or medicines when you go out.', 'बाहर जाते समय अपना इनहेलर या दवाएँ साथ रखें।']]
};
export const PROFILES = ['general', 'outdoor_worker', 'commuter', 'athlete', 'children', 'older', 'pregnant', 'heart_lung'];

export function bandFor(pm) {
  if (!Number.isFinite(pm)) return null;
  const index = BANDS.findIndex(band => pm <= band.max);
  const { max, ...band } = BANDS[index];
  return { ...band, index };
}

export function actionsFor(index, profile = 'general') {
  const set = ACTIONS[index][SENSITIVE.includes(profile) ? 1 : 0];
  const hasMask = set.en.some(text => text.includes('N95'));
  const extras = (EXTRAS[profile] || []).filter(([from, en]) => index >= from && !(hasMask && en.includes('N95')));
  return { en: [...set.en, ...extras.map(x => x[1])], hi: [...set.hi, ...extras.map(x => x[2])] };
}

// Pollutants from the CAMS model, levelled on CPCB AQI breakpoints (24h, or 8h for O3/CO); indicative for an hourly value.
// "affects" lists the personas for whom Saans highlights the pollutant.
const POLLUTANTS = [
  { key: 'pm2_5', name: 'PM2.5', unit: 'µg/m³', limits: [30, 60, 90, 120, 250], affects: ['outdoor_worker', 'commuter', 'athlete', 'children', 'older', 'pregnant', 'heart_lung'],
    about: { en: 'Fine particles from vehicles, burning and industry. They reach deep into the lungs and bloodstream and strain the heart and lungs.', hi: 'वाहनों, जलने और उद्योगों से निकले बारीक कण। ये फेफड़ों और खून तक पहुँचकर हृदय और फेफड़ों पर दबाव डालते हैं।' } },
  { key: 'pm10', name: 'PM10', unit: 'µg/m³', limits: [50, 100, 250, 350, 430], affects: ['outdoor_worker', 'commuter', 'children', 'older', 'heart_lung'],
    about: { en: 'Coarser dust from construction, roads and soil. It irritates the nose, throat and airways and can trigger coughing.', hi: 'निर्माण, सड़कों और मिट्टी की मोटी धूल। यह नाक, गले और साँस की नली में जलन और खाँसी पैदा कर सकती है।' } },
  { key: 'nitrogen_dioxide', name: 'NO₂', unit: 'µg/m³', limits: [40, 80, 180, 280, 400], affects: ['commuter', 'athlete', 'children', 'heart_lung'],
    about: { en: 'A gas mainly from traffic exhaust. It inflames the airways and can make asthma worse, especially near busy roads.', hi: 'मुख्यतः वाहनों के धुएँ से निकलने वाली गैस। यह साँस की नली में सूजन लाती है और अस्थमा बढ़ा सकती है, ख़ासकर व्यस्त सड़कों के पास।' } },
  { key: 'ozone', name: 'O₃', unit: 'µg/m³', limits: [50, 100, 168, 208, 748], affects: ['outdoor_worker', 'athlete', 'children', 'older', 'heart_lung'],
    about: { en: 'Forms in sunlight and usually peaks in the afternoon. It can cause chest tightness and coughing during exertion.', hi: 'धूप में बनती है और आमतौर पर दोपहर में सबसे ज़्यादा होती है। मेहनत के दौरान सीने में जकड़न और खाँसी हो सकती है।' } },
  { key: 'carbon_monoxide', name: 'CO', unit: 'mg/m³', scale: 0.001, limits: [1, 2, 10, 17, 34], affects: ['commuter', 'older', 'pregnant', 'heart_lung'],
    about: { en: 'From traffic and burning fuel. It lowers the oxygen your blood can carry, which matters most for the heart and during pregnancy.', hi: 'वाहनों और ईंधन जलने से। यह खून में ऑक्सीजन कम करती है, जो हृदय और गर्भावस्था में सबसे ज़्यादा मायने रखता है।' } },
  { key: 'sulphur_dioxide', name: 'SO₂', unit: 'µg/m³', limits: [40, 80, 380, 800, 1600], affects: ['children', 'heart_lung'],
    about: { en: 'From coal burning and industry. It can narrow the airways, especially in people with asthma.', hi: 'कोयला जलने और उद्योगों से। यह साँस की नली को सिकोड़ सकती है, ख़ासकर अस्थमा वाले लोगों में।' } }
];
export const POLLUTANT_KEYS = POLLUTANTS.map(p => p.key);

export function pollutantsFor(values) {
  return POLLUTANTS.filter(p => Number.isFinite(values[p.key])).map(({ limits, scale = 1, ...p }) => {
    const value = Math.round(values[p.key] * scale * 10) / 10;
    const found = limits.findIndex(max => value <= max);
    const index = found < 0 ? 5 : found;
    const { max, impact, ...band } = BANDS[index];
    return { ...p, value, level: { ...band, index } };
  });
}

export function guidanceFor(pm) {
  const band = bandFor(pm);
  if (!band) return null;
  return { band, actions: Object.fromEntries(PROFILES.map(p => [p, actionsFor(band.index, p)])), source: CPCB_SOURCE,
    note: 'Indicative: CPCB PM2.5 breakpoints are defined for 24-hour averages. Not medical advice.' };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = deg => Number.isFinite(deg) ? COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8] : null;
