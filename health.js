// Health page: an animated lung showing where each pollutant lands, and what it does short and long term.
// Loaded before app.js; uses its globals (lastData, ui, langKey, PERSONAS, selectedProfile, safeText) at render time.

const ZONES = {
  upper: { en: 'Nose & throat', hi: 'नाक और गला', y: 34, tx: 210, ty: 36 },
  trachea: { en: 'Windpipe', hi: 'श्वास नली', y: 128, tx: 203, ty: 128 },
  bronchi: { en: 'Bronchi', hi: 'ब्रोंकाई', y: 214, tx: 150, ty: 232 },
  bronchioles: { en: 'Bronchioles', hi: 'ब्रोंकिओल्स', y: 300, tx: 116, ty: 292 },
  alveoli: { en: 'Alveoli', hi: 'एल्वियोली (वायुकोष)', y: 372, tx: 92, ty: 346 },
  blood: { en: 'Blood & heart', hi: 'खून और दिल', y: 446, tx: 204, ty: 404 }
};

// WHO 2021 guidelines (24-hour; ozone is 8-hour). CO in mg/m³ to match the API.
const HEALTH = {
  pm2_5: { color: '#8a5a44', kind: 'particle', r: 2.6, zones: ['bronchioles', 'alveoli', 'blood'], who: 15,
    en: { where: 'Fine particles slip past the nose and throat and settle in the smallest airways and the alveoli, where oxygen enters the blood. The finest fraction crosses into the bloodstream.',
      short: ['Cough, throat irritation and a tight chest', 'Asthma attacks and COPD flare-ups', 'Higher risk of heart attack and stroke on bad days for people with heart disease'],
      long: ['Children’s lungs grow less; adults lose lung function faster', 'Chronic bronchitis, COPD and lung cancer (outdoor air pollution is a WHO/IARC Group 1 carcinogen)', 'Hardened arteries, heart disease and stroke', 'Low birth weight and preterm birth', 'Linked to type 2 diabetes and dementia'],
      helps: 'A well-fitted N95 filters most PM2.5. Indoors, close windows during bad hours and run a HEPA purifier.' },
    hi: { where: 'महीन कण नाक और गले से बचकर सबसे छोटी श्वास नलियों और एल्वियोली (वायुकोष) में बैठ जाते हैं, जहाँ से ऑक्सीजन खून में जाती है। सबसे बारीक कण खून तक पहुँच जाते हैं।',
      short: ['खाँसी, गले में जलन और सीने में जकड़न', 'अस्थमा के दौरे और COPD का बिगड़ना', 'हृदय रोगियों में ख़राब दिनों पर दिल का दौरा और स्ट्रोक का ख़तरा'],
      long: ['बच्चों के फेफड़ों का विकास कम; वयस्कों की फेफड़ों की क्षमता तेज़ी से घटती है', 'क्रॉनिक ब्रोंकाइटिस, COPD और फेफड़ों का कैंसर (WHO/IARC: बाहरी वायु प्रदूषण ग्रुप 1 कैंसरकारी)', 'धमनियों का सख़्त होना, हृदय रोग और स्ट्रोक', 'कम वज़न वाला या समय से पहले जन्म', 'टाइप 2 डायबिटीज़ और डिमेंशिया से संबंध'],
      helps: 'अच्छी तरह फिट N95 ज़्यादातर PM2.5 रोकता है। घर में ख़राब घंटों में खिड़कियाँ बंद रखें और HEPA प्यूरीफ़ायर चलाएँ।' } },
  pm10: { color: '#a47a4c', kind: 'particle', r: 4.2, zones: ['upper', 'trachea', 'bronchi'], who: 45,
    en: { where: 'Coarse dust is mostly caught in the nose, throat, windpipe and large bronchi, where mucus and tiny hairs (cilia) try to sweep it back out.',
      short: ['Sneezing, runny nose, itchy eyes and throat', 'Cough with phlegm', 'Asthma and bronchitis symptoms get worse'],
      long: ['Chronic bronchitis from constant irritation', 'Lower lung function', 'More hospital visits for asthma and COPD'],
      helps: 'Masks work well on coarse dust. Wet down dust at work sites and mop floors damp instead of sweeping.' },
    hi: { where: 'मोटी धूल ज़्यादातर नाक, गले, श्वास नली और बड़ी ब्रोंकाई में फँसती है, जहाँ बलगम और छोटे बाल (सिलिया) उसे बाहर निकालने की कोशिश करते हैं।',
      short: ['छींक, नाक बहना, आँखों और गले में खुजली', 'बलगम वाली खाँसी', 'अस्थमा और ब्रोंकाइटिस के लक्षण बढ़ना'],
      long: ['लगातार जलन से क्रॉनिक ब्रोंकाइटिस', 'फेफड़ों की क्षमता में कमी', 'अस्थमा और COPD के लिए अस्पताल जाने की ज़रूरत बढ़ना'],
      helps: 'मोटी धूल पर मास्क अच्छा काम करता है। काम की जगह धूल पर पानी छिड़कें और झाड़ू की जगह गीला पोछा लगाएँ।' } },
  nitrogen_dioxide: { color: '#b0623a', kind: 'gas', r: 5, zones: ['bronchi', 'bronchioles'], who: 25,
    en: { where: 'A gas mostly from vehicle exhaust. It reaches the bronchi and small airways and inflames their lining.',
      short: ['Wheezing and cough near busy roads', 'Airways over-react to pollen and dust', 'Asthma attacks in children'],
      long: ['Children growing up near heavy traffic are more likely to develop asthma', 'More frequent chest infections', 'Helps form ozone and fine particles downwind'],
      helps: 'Walk or wait a street back from heavy traffic; in a car, use recirculation in jams. Masks do not stop gases.' },
    hi: { where: 'ज़्यादातर गाड़ियों के धुएँ से निकलने वाली गैस। यह ब्रोंकाई और छोटी श्वास नलियों तक पहुँचकर उनकी परत में सूजन लाती है।',
      short: ['व्यस्त सड़कों के पास घरघराहट और खाँसी', 'पराग और धूल पर श्वास नलियाँ ज़्यादा प्रतिक्रिया करती हैं', 'बच्चों में अस्थमा के दौरे'],
      long: ['भारी ट्रैफ़िक के पास पलने वाले बच्चों में अस्थमा की संभावना ज़्यादा', 'छाती के संक्रमण बार-बार', 'आगे जाकर ओज़ोन और महीन कण बनाने में मदद'],
      helps: 'भारी ट्रैफ़िक से एक गली दूर चलें या रुकें; कार में जाम के समय हवा रीसर्कुलेट करें। मास्क गैसों को नहीं रोकते।' } },
  ozone: { color: '#5b7fa6', kind: 'gas', r: 5, zones: ['trachea', 'bronchi', 'bronchioles', 'alveoli'], who: 100, whoNote: '8h',
    en: { where: 'A reactive gas made in sunlight. It irritates the lining all the way down, hardest where the smallest airways meet the alveoli.',
      short: ['Pain on a deep breath and a tight chest', 'Cough and throat irritation, worse during exercise', 'Lungs take in less air for hours to days'],
      long: ['Faster loss of lung function over the years', 'May start asthma in children who play outdoors a lot', 'COPD gets worse'],
      helps: 'Ozone peaks on sunny afternoons. Exercise early in the morning or in the evening. Masks do not stop it.' },
    hi: { where: 'धूप में बनने वाली सक्रिय गैस। यह पूरी श्वास नली की परत को नुकसान पहुँचाती है, सबसे ज़्यादा वहाँ जहाँ सबसे छोटी नलियाँ एल्वियोली से मिलती हैं।',
      short: ['गहरी साँस लेने पर दर्द और सीने में जकड़न', 'खाँसी और गले में जलन, व्यायाम के दौरान ज़्यादा', 'घंटों से दिनों तक फेफड़े कम हवा ले पाते हैं'],
      long: ['सालों में फेफड़ों की क्षमता तेज़ी से घटना', 'बाहर बहुत खेलने वाले बच्चों में अस्थमा शुरू हो सकता है', 'COPD का बिगड़ना'],
      helps: 'ओज़ोन धूप वाली दोपहर में सबसे ज़्यादा होती है। सुबह जल्दी या शाम को व्यायाम करें। मास्क इसे नहीं रोकते।' } },
  carbon_monoxide: { color: '#7a6f8f', kind: 'gas', r: 4.5, zones: ['alveoli', 'blood'], who: 4,
    en: { where: 'An invisible gas that passes straight through the alveoli into the blood, where it grabs haemoglobin about 200 times more tightly than oxygen.',
      short: ['Less oxygen reaches the heart and brain', 'Headache, dizziness and tiredness', 'Chest pain sooner in people with heart disease'],
      long: ['Repeated exposure strains the heart', 'Less oxygen for the baby during pregnancy'],
      helps: 'Highest in traffic jams and near stoves or heaters in closed rooms. Never run a generator, angithi or heater in a closed room.' },
    hi: { where: 'एक अदृश्य गैस जो सीधे एल्वियोली से खून में जाती है और हीमोग्लोबिन को ऑक्सीजन से लगभग 200 गुना ज़्यादा मज़बूती से पकड़ लेती है।',
      short: ['दिल और दिमाग़ तक कम ऑक्सीजन पहुँचती है', 'सिरदर्द, चक्कर और थकान', 'हृदय रोगियों में जल्दी सीने में दर्द'],
      long: ['बार-बार संपर्क से दिल पर ज़ोर', 'गर्भावस्था में शिशु को कम ऑक्सीजन'],
      helps: 'ट्रैफ़िक जाम में और बंद कमरों में चूल्हे या हीटर के पास सबसे ज़्यादा। बंद कमरे में जनरेटर, अंगीठी या हीटर कभी न चलाएँ।' } },
  sulphur_dioxide: { color: '#9c8a3a', kind: 'gas', r: 4.5, zones: ['upper', 'trachea'], who: 40,
    en: { where: 'Dissolves easily in moisture, so most of it is absorbed in the nose, throat and upper airways.',
      short: ['Airways tighten within minutes in people with asthma', 'Burning nose and throat, cough', 'Worse while exercising, when you breathe through the mouth'],
      long: ['Chronic bronchitis', 'Turns into sulphate particles that add to PM2.5'],
      helps: 'Mostly from coal power plants, industry and diesel. People with asthma should keep a reliever inhaler handy near industrial areas.' },
    hi: { where: 'नमी में आसानी से घुल जाती है, इसलिए ज़्यादातर नाक, गले और ऊपरी श्वास नलियों में सोख ली जाती है।',
      short: ['अस्थमा वालों में कुछ ही मिनटों में श्वास नलियाँ सिकुड़ जाती हैं', 'नाक और गले में जलन, खाँसी', 'व्यायाम में मुँह से साँस लेने पर असर ज़्यादा'],
      long: ['क्रॉनिक ब्रोंकाइटिस', 'सल्फ़ेट कणों में बदलकर PM2.5 बढ़ाती है'],
      helps: 'ज़्यादातर कोयला बिजलीघरों, उद्योग और डीज़ल से। औद्योगिक इलाक़ों के पास अस्थमा वाले रिलीवर इनहेलर साथ रखें।' } }
};
const HEALTH_NAMES = { pm2_5: 'PM2.5', pm10: 'PM10', nitrogen_dioxide: 'NO₂', ozone: 'O₃', carbon_monoxide: 'CO', sulphur_dioxide: 'SO₂' };
// ponytail: rough daily breathing volumes (m³/day) after the US EPA Exposure Factors Handbook; a real dose model needs age, weight and activity logs.
const BREATH_M3 = { general: 14, outdoor_worker: 24, commuter: 17, athlete: 22, children: 10, older: 12, pregnant: 16, heart_lung: 13 };

const HEALTH_UI = {
  en: { kicker: 'INSIDE YOUR LUNGS · LIVE SIMULATION', title: 'Where today’s air ends up', sim: 'More dots = a higher level right now. Glowing parts are where this pollutant does its damage.',
    where: 'Where it lands', shortT: 'Within hours to days', longT: 'With more exposure over months and years', helps: 'What helps', now: 'Now', who: (x, g, note) => `${x}× the WHO ${note === '8h' ? '8-hour' : '24-hour'} guideline (${g})`, underWho: 'Within the WHO guideline',
    forYou: (persona, name) => `As ${persona.toLowerCase()}, you are in a higher-risk group for ${name}.`, noData: 'Live level not available', inset: 'ALVEOLUS + CAPILLARY',
    doseTitle: 'If you breathe this air', cig: n => `≈ ${n} cigarette${n === '1' ? '' : 's'}`, cigBody: pm => `Breathing ${pm} µg/m³ of PM2.5 for 24 hours is roughly like smoking that many cigarettes (Berkeley Earth rule of thumb).`,
    air: v => `~${v} m³ of air a day`, airBody: (persona, dose) => `${persona}: at today’s level that is about ${dose} µg of PM2.5 inhaled. Children breathe more air per kg of body weight than adults.`,
    years: y => `${y} years`, yearsBody: 'Life expectancy lost if today’s PM2.5 lasted all year, compared with the WHO guideline of 5 µg/m³ (AQLI method). One bad day does not do this; years of exposure do.',
    note: 'Educational, not medical advice. If you have trouble breathing, chest pain or feel faint, seek medical care.', sources: 'Sources' },
  hi: { kicker: 'आपके फेफड़ों के अंदर · लाइव सिमुलेशन', title: 'आज की हवा कहाँ तक पहुँचती है', sim: 'ज़्यादा बिंदु = अभी ज़्यादा स्तर। चमकते हिस्से वे हैं जहाँ यह प्रदूषक नुकसान करता है।',
    where: 'कहाँ पहुँचता है', shortT: 'घंटों से दिनों में', longT: 'महीनों और सालों के संपर्क से', helps: 'क्या मदद करता है', now: 'अभी', who: (x, g, note) => `WHO ${note === '8h' ? '8-घंटे' : '24-घंटे'} सीमा (${g}) का ${x} गुना`, underWho: 'WHO सीमा के भीतर',
    forYou: (persona, name) => `${persona} होने के कारण आप ${name} के लिए ज़्यादा जोखिम वाले समूह में हैं।`, noData: 'लाइव स्तर उपलब्ध नहीं', inset: 'वायुकोष + केशिका',
    doseTitle: 'अगर आप यह हवा साँस में लेते हैं', cig: n => `≈ ${n} सिगरेट`, cigBody: pm => `24 घंटे ${pm} µg/m³ PM2.5 में साँस लेना लगभग इतनी सिगरेट पीने जैसा है (Berkeley Earth का अनुमान)।`,
    air: v => `रोज़ ~${v} m³ हवा`, airBody: (persona, dose) => `${persona}: आज के स्तर पर लगभग ${dose} µg PM2.5 साँस के साथ अंदर जाता है। बच्चे शरीर के वज़न के हिसाब से वयस्कों से ज़्यादा हवा लेते हैं।`,
    years: y => `${y} वर्ष`, yearsBody: 'अगर आज जैसा PM2.5 पूरे साल रहे तो WHO सीमा (5 µg/m³) की तुलना में घटने वाली औसत उम्र (AQLI पद्धति)। एक ख़राब दिन से नहीं, सालों के संपर्क से।',
    note: 'शैक्षिक जानकारी, चिकित्सकीय सलाह नहीं। साँस लेने में तकलीफ़, सीने में दर्द या चक्कर हो तो तुरंत डॉक्टर से मिलें।', sources: 'स्रोत' }
};

let healthPollutant = 'pm2_5';

// Airway tree in SVG units; the right lung is the mirror image, nudged for the heart notch.
const NODE = { top: [210, 6], nose: [210, 32], throat: [210, 86], car: [210, 184],
  L1: [160, 224], L2a: [128, 264], L2b: [166, 298], L3a: [100, 318], L3b: [140, 340], L3c: [146, 378], L3d: [182, 356],
  R1: [260, 224], R2a: [292, 264], R2b: [256, 296], R3a: [320, 318], R3b: [282, 338], R3c: [292, 380], R3d: [250, 350] };
const BRONCHI = [['car', 'L1', 12], ['car', 'R1', 12], ['L1', 'L2a', 9], ['L1', 'L2b', 9], ['R1', 'R2a', 9], ['R1', 'R2b', 9]];
const BRONCHIOLES = [['L2a', 'L3a'], ['L2a', 'L3b'], ['L2b', 'L3c'], ['L2b', 'L3d'], ['R2a', 'R3a'], ['R2a', 'R3b'], ['R2b', 'R3c'], ['R2b', 'R3d']];
const TIPS = BRONCHIOLES.map(([, end]) => end);
const twigs = end => { const [x, y] = NODE[end]; return [[x - 13, y + 22], [x + 11, y + 26]]; };
const PARENT = Object.fromEntries([...BRONCHI, ...BRONCHIOLES].map(([a, b]) => [b, a]));
const routeTo = node => { const path = []; for (let n = node; n; n = PARENT[n]) path.unshift(NODE[n]); return [NODE.top, NODE.nose, NODE.throat, ...path]; };

function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// One flight path per particle: through the airways to its deposit point in one of the pollutant's zones.
function particleRoute(zone, rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  if (zone === 'upper') return [NODE.top, [210 + (rand() - .5) * 14, 22 + rand() * 50]];
  if (zone === 'trachea') return [NODE.top, NODE.nose, NODE.throat, [210 + (rand() - .5) * 8, 100 + rand() * 76]];
  if (zone === 'bronchi') return routeTo(pick(['L2a', 'L2b', 'R2a', 'R2b']));
  if (zone === 'bronchioles') return routeTo(pick(TIPS));
  const tip = pick(TIPS);
  return [...routeTo(tip), pick(twigs(tip))]; // alveoli and blood
}

function lungSvg(key, levelIndex, lang) {
  const h = HEALTH[key], hot = new Set(h.zones);
  const reduce = document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seg = ([a, b, w = 5]) => `<path d="M${NODE[a]} L${NODE[b]}" stroke-width="${w}"/>`;
  const alveoli = TIPS.flatMap(twigs).map(([x, y]) => `<g><circle cx="${x}" cy="${y}" r="6"/><circle cx="${x - 5}" cy="${y + 5}" r="4.5"/><circle cx="${x + 5}" cy="${y + 5}" r="4.5"/></g>`).join('');
  const twigPaths = TIPS.map(t => twigs(t).map(([x, y]) => `<path d="M${NODE[t]} L${x} ${y}" stroke-width="3"/>`).join('')).join('');
  const rand = seeded(key.length * 7919 + levelIndex);
  const count = 6 + Math.max(0, levelIndex) * 4;
  const particles = Array.from({ length: count }, (_, i) => {
    const zone = h.zones[i % h.zones.length];
    const pts = particleRoute(zone, rand);
    const d = `M${pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L')}`;
    const end = pts.at(-1);
    const dur = (3.2 + rand() * 2.4).toFixed(2), begin = (-rand() * 6).toFixed(2);
    const shape = h.kind === 'gas' ? `r="${h.r}" fill="${h.color}" fill-opacity=".38" filter="url(#lungBlur)"` : `r="${h.r}" fill="${h.color}" stroke="#fff" stroke-width=".8"`;
    if (reduce) return `<circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" ${shape}/>`;
    return `<circle ${shape}><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}" keyPoints="0;1;1" keyTimes="0;.68;1" calcMode="linear"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="${dur}s" begin="${begin}s" repeatCount="indefinite"/></circle>`;
  }).join('');
  // Blood inset: red cells always flow; pollutant joins them when it reaches the blood.
  const capillary = 'M300 116 C330 104 356 128 384 112 S420 100 430 108';
  const cells = reduce ? '' : [0, 1, 2, 3].map(i => `<ellipse rx="4.5" ry="2.6" fill="#d0625a"><animateMotion dur="4s" begin="-${i}s" repeatCount="indefinite" path="${capillary}" rotate="auto"/></ellipse>`).join('');
  const intoBlood = hot.has('blood') && !reduce ? [0, 1, 2].map(i => `<circle r="${Math.min(h.r, 3.2)}" fill="${h.color}" ${h.kind === 'gas' ? 'fill-opacity=".6"' : ''}><animateMotion dur="3.6s" begin="-${i * 1.2}s" repeatCount="indefinite" path="M346 62 C350 80 352 96 356 112 S392 112 430 108"/></circle>`).join('') : '';
  const label = (zone, side) => {
    const z = ZONES[zone], on = hot.has(zone);
    const x = side === 'left' ? -54 : 300;
    return `<g class="zone-label${on ? ' on' : ''}"><path d="M${side === 'left' ? 16 : 296} ${z.y - 4} L${z.tx} ${z.ty}"/><text x="${x}" y="${z.y}">${safeText(z[lang])}</text></g>`;
  };
  return `<svg class="lung-svg" viewBox="-60 0 500 470" role="img" aria-label="${safeText(HEALTH_NAMES[key])}: ${h.zones.map(z => ZONES[z].en).join(', ')}">
    <defs><filter id="lungBlur"><feGaussianBlur stdDeviation="1.6"/></filter><filter id="hurtGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="lungFill" cx=".45" cy=".35"><stop stop-color="#fff4ef"/><stop offset="1" stop-color="#f6d9cf"/></radialGradient><clipPath id="insetClip"><circle cx="360" cy="84" r="58"/></clipPath></defs>
    <path class="lung-lobe" d="M196 196 C186 160 150 150 120 172 C86 198 68 262 64 330 C60 392 76 428 112 432 C150 434 182 420 194 398 C200 330 202 250 196 196Z"/>
    <path class="lung-lobe" d="M224 196 C234 160 270 150 300 172 C334 198 352 262 356 330 C360 392 344 428 308 432 C278 434 258 426 248 414 C260 398 258 380 242 372 C228 320 220 250 224 196Z"/>
    <g class="zone zone-blood${hot.has('blood') ? ' hot' : ''}"><path class="heart" d="M222 392 c-7-12-28-9-28 7 c0 14 18 25 28 34 c10-9 28-20 28-34 c0-16-21-19-28-7Z"/></g>
    <g class="zone zone-upper${hot.has('upper') ? ' hot' : ''}"><path class="airway-shape" d="M182 16 Q210 0 238 16 Q246 42 226 58 L220 88 L200 88 L194 58 Q174 42 182 16Z"/></g>
    <g class="zone zone-trachea${hot.has('trachea') ? ' hot' : ''}"><rect class="airway-shape" x="201" y="86" width="18" height="100" rx="7"/>${[100, 112, 124, 136, 148, 160, 172].map(y => `<path class="ring" d="M203 ${y} h14"/>`).join('')}</g>
    <g class="zone zone-bronchi airway${hot.has('bronchi') ? ' hot' : ''}">${BRONCHI.map(seg).join('')}</g>
    <g class="zone zone-bronchioles airway${hot.has('bronchioles') ? ' hot' : ''}">${BRONCHIOLES.map(([a, b]) => seg([a, b, 5])).join('')}${twigPaths}</g>
    <g class="zone zone-alveoli alveoli${hot.has('alveoli') ? ' hot' : ''}">${alveoli}</g>
    <g class="particles">${particles}</g>
    <path class="inset-link" d="M320 318 C340 250 350 170 352 144"/>
    <g class="inset${hot.has('alveoli') || hot.has('blood') ? ' hot' : ''}"><circle cx="360" cy="84" r="60" class="inset-ring"/><g clip-path="url(#insetClip)"><rect x="296" y="20" width="130" height="130" fill="#fff7f3"/>
      <g class="sacs"><circle cx="330" cy="62" r="20"/><circle cx="364" cy="50" r="22"/><circle cx="396" cy="70" r="19"/><circle cx="350" cy="88" r="15"/></g>
      <path class="capillary" d="${capillary}"/>${cells}${intoBlood}</g><text x="360" y="162" text-anchor="middle" class="inset-label">${safeText(HEALTH_UI[lang].inset)}</text></g>
    ${label('upper', 'left')}${label('trachea', 'left')}${label('bronchi', 'left')}${label('bronchioles', 'left')}${label('alveoli', 'left')}${label('blood', 'left')}
  </svg>`;
}

function renderHealth() {
  const root = document.getElementById('health');
  if (!root) return;
  const lang = langKey(), t = HEALTH_UI[lang], copy = HEALTH[healthPollutant];
  const live = Object.fromEntries((lastData?.pollutants || []).map(p => [p.key, p]));
  const p = live[healthPollutant];
  const tabs = Object.keys(HEALTH).map(key => {
    const lp = live[key];
    return `<button type="button" role="tab" aria-selected="${key === healthPollutant}" class="lung-tab${key === healthPollutant ? ' active' : ''}" data-key="${key}" style="--dot:${HEALTH[key].color}"><i></i><b>${HEALTH_NAMES[key]}</b>${lp ? `<small style="color:${lp.level.color}">${lp.value} ${safeText(lp.unit)}</small>` : ''}</button>`;
  }).join('');
  const ratio = p && Number.isFinite(p.value) ? p.value / copy.who : null;
  const whoText = ratio == null ? '' : ratio > 1.05 ? t.who(ratio.toFixed(1), `${copy.who} ${p.unit}`, copy.whoNote) : t.underWho;
  const mine = p?.affects.includes(selectedProfile);
  const list = items => `<ul>${items.map(x => `<li>${safeText(x)}</li>`).join('')}</ul>`;
  const pm = lastData?.estimate?.pm2_5;
  const vol = BREATH_M3[selectedProfile] || 14;
  const persona = personaLabel();
  const dose = Number.isFinite(pm) ? `<div class="dose-grid">
      <div class="dose-tile"><span class="dose-icon">🚬</span><b>${t.cig((pm / 22).toFixed(1))}</b><p>${safeText(t.cigBody(Math.round(pm)))}</p></div>
      <div class="dose-tile"><span class="dose-icon">${PERSONAS[selectedProfile].icon}</span><b>${t.air(vol)}</b><p>${safeText(t.airBody(persona, Math.round(pm * vol).toLocaleString('en-IN')))}</p></div>
      <div class="dose-tile"><span class="dose-icon">⏳</span><b>${t.years((Math.max(0, pm - 5) * 0.098).toFixed(1))}</b><p>${safeText(t.yearsBody)}</p></div></div>` : '';
  root.querySelector('.health-body').innerHTML = `<div class="health-grid">
    <article class="card lung-card"><span class="section-kicker">${t.kicker}</span><h3>${t.title}</h3>
      <div class="lung-tabs" role="tablist">${tabs}</div>
      <div class="lung-stage">${lungSvg(healthPollutant, p?.level.index ?? 2, lang)}</div><small class="lung-note">${t.sim}</small></article>
    <article class="card harm-card"><div class="harm-head"><h3>${HEALTH_NAMES[healthPollutant]}</h3>${p ? `<span class="band-pill" style="--band:${p.level.color}"><i></i>${t.now}: ${p.value} ${safeText(p.unit)} · ${safeText(p.level.label[lang])}</span>` : `<span class="band-pill"><i></i>${t.noData}</span>`}</div>
      ${whoText ? `<p class="harm-who">${safeText(whoText)}</p>` : ''}
      ${mine ? `<p class="harm-you">${PERSONAS[selectedProfile].icon} ${safeText(t.forYou(persona, HEALTH_NAMES[healthPollutant]))}</p>` : ''}
      <h4>${t.where}</h4><p>${safeText(copy[lang].where)}</p>
      <div class="harm-cols"><div><h4>⚡ ${t.shortT}</h4>${list(copy[lang].short)}</div><div class="harm-long"><h4>⏳ ${t.longT}</h4>${list(copy[lang].long)}</div></div>
      <h4>${t.helps}</h4><p>${safeText(copy[lang].helps)}</p></article></div>
    ${dose ? `<h3 class="dose-title">${t.doseTitle}</h3>${dose}` : ''}
    <small class="health-note">${t.note} ${t.sources}: <a href="https://www.who.int/publications/i/item/9789240034228" target="_blank" rel="noreferrer">WHO 2021 ↗</a> <a href="https://www.epa.gov/pm-pollution/health-and-environmental-effects-particulate-matter-pm" target="_blank" rel="noreferrer">US EPA ↗</a> <a href="https://aqli.epic.uchicago.edu/" target="_blank" rel="noreferrer">AQLI ↗</a> <a href="https://berkeleyearth.org/air-pollution-and-cigarette-equivalence/" target="_blank" rel="noreferrer">Berkeley Earth ↗</a></small>`;
  root.querySelectorAll('.lung-tab').forEach(button => button.addEventListener('click', () => { healthPollutant = button.dataset.key; renderHealth(); }));
}
