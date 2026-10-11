// Daily air challenge: one question a day (same for everyone, rotated by date), a streak, and past questions to practise.
// Loaded before app.js; uses its globals (langKey, safeText, toast) at render time. Progress stays on this device (saans-quiz).

// [question en, hi, options en, options hi, correct index, why en, why hi]
const QUIZ = [
  ['What does “PM2.5” mean?', '“PM2.5” का मतलब क्या है?', ['2.5 times the safe limit', 'Particles 2.5 micrometres across or smaller', 'Pollution measured at 2.5 pm', '2.5 mg of dust per m³'], ['सुरक्षित सीमा का 2.5 गुना', '2.5 माइक्रोमीटर या उससे छोटे कण', 'दोपहर 2:30 बजे मापा गया प्रदूषण', 'प्रति m³ 2.5 mg धूल'], 1,
    'PM2.5 are particles 2.5 µm or smaller, about 30 times thinner than a hair, small enough to reach the deepest parts of the lungs.', 'PM2.5 यानी 2.5 µm या उससे छोटे कण, बाल से लगभग 30 गुना पतले, जो फेफड़ों के सबसे गहरे हिस्से तक पहुँचते हैं।'],
  ['Which mask actually filters fine particles?', 'कौन सा मास्क सच में महीन कण रोकता है?', ['A cloth mask', 'A loose surgical mask', 'A well-fitted N95 or FFP2', 'A wet handkerchief'], ['कपड़े का मास्क', 'ढीला सर्जिकल मास्क', 'अच्छी तरह फिट N95 या FFP2', 'गीला रूमाल'], 2,
    'N95/FFP2 filters about 95% of fine particles, but only if it seals around the nose and chin. Cloth and loose masks let most PM2.5 through the gaps.', 'N95/FFP2 लगभग 95% महीन कण रोकता है, पर तभी जब नाक और ठुड्डी पर कसकर बैठे। कपड़े और ढीले मास्क से ज़्यादातर PM2.5 निकल जाता है।'],
  ['Can a few indoor plants clean PM2.5 from a room?', 'क्या कुछ पौधे कमरे से PM2.5 साफ़ कर सकते हैं?', ['Yes, 3–4 plants are enough', 'Only snake plants can', 'No, you would need hundreds, and they do not trap particles', 'Yes, if kept near the window'], ['हाँ, 3–4 पौधे काफ़ी हैं', 'सिर्फ़ स्नेक प्लांट कर सकता है', 'नहीं, सैकड़ों चाहिए, और वे कण नहीं पकड़ते', 'हाँ, खिड़की के पास रखें तो'], 2,
    'Studies find plants clean air far slower than normal ventilation, and they do not remove PM2.5. A HEPA purifier does.', 'अध्ययनों के अनुसार पौधे सामान्य हवा के आने-जाने से बहुत धीमे हवा साफ़ करते हैं और PM2.5 नहीं हटाते। HEPA प्यूरीफ़ायर हटाता है।'],
  ['When does ozone (O₃) usually peak?', 'ओज़ोन (O₃) आमतौर पर कब सबसे ज़्यादा होती है?', ['Early morning', 'Sunny afternoons', 'Midnight', 'During rain'], ['सुबह-सुबह', 'धूप वाली दोपहर', 'आधी रात', 'बारिश के दौरान'], 1,
    'Ozone forms when sunlight reacts with traffic and industrial gases, so it builds up through the day and peaks in the afternoon.', 'ओज़ोन तब बनती है जब धूप ट्रैफ़िक और उद्योग की गैसों से प्रतिक्रिया करती है, इसलिए यह दिन भर बढ़ती है और दोपहर में सबसे ज़्यादा होती है।'],
  ['What is the WHO 2021 guideline for yearly average PM2.5?', 'सालाना औसत PM2.5 के लिए WHO 2021 की सीमा क्या है?', ['5 µg/m³', '15 µg/m³', '40 µg/m³', '60 µg/m³'], ['5 µg/m³', '15 µg/m³', '40 µg/m³', '60 µg/m³'], 0,
    'WHO tightened it to 5 µg/m³ a year (15 for a 24-hour day). India’s own annual standard is 40 µg/m³.', 'WHO ने इसे सालाना 5 µg/m³ (24 घंटे के लिए 15) कर दिया। भारत का अपना सालाना मानक 40 µg/m³ है।'],
  ['On the CPCB AQI scale, which range is “Poor”?', 'CPCB AQI पैमाने पर “ख़राब” कौन सी सीमा है?', ['51–100', '101–200', '201–300', '401–500'], ['51–100', '101–200', '201–300', '401–500'], 2,
    'Good 0–50, Satisfactory 51–100, Moderate 101–200, Poor 201–300, Very Poor 301–400, Severe 401–500.', 'अच्छा 0–50, संतोषजनक 51–100, मध्यम 101–200, ख़राब 201–300, बहुत ख़राब 301–400, गंभीर 401–500।'],
  ['Why is winter air in north India often the worst?', 'उत्तर भारत में सर्दियों की हवा अक्सर सबसे ख़राब क्यों होती है?', ['More cars run in winter', 'Cold, calm air and a shallow mixing layer trap pollution near the ground', 'Ozone rises in winter', 'Monitors are less accurate in cold'], ['सर्दियों में ज़्यादा गाड़ियाँ चलती हैं', 'ठंडी, शांत हवा और नीची मिश्रण परत प्रदूषण को ज़मीन के पास फँसा देती है', 'सर्दियों में ओज़ोन बढ़ती है', 'ठंड में मॉनिटर कम सटीक होते हैं'], 1,
    'On cold nights the air near the ground stops rising (an inversion), so smoke and dust from the same sources have far less room to spread. Stubble smoke adds to it in Oct–Nov.', 'ठंडी रातों में ज़मीन के पास की हवा ऊपर नहीं उठती (इनवर्ज़न), इसलिए उन्हीं स्रोतों का धुआँ और धूल फैल नहीं पाते। अक्टूबर–नवंबर में पराली का धुआँ भी जुड़ता है।'],
  ['Which gas comes mostly from vehicle exhaust?', 'कौन सी गैस मुख्यतः गाड़ियों के धुएँ से आती है?', ['Nitrogen dioxide (NO₂)', 'Oxygen', 'Ozone directly', 'Carbon dioxide only'], ['नाइट्रोजन डाइऑक्साइड (NO₂)', 'ऑक्सीजन', 'सीधे ओज़ोन', 'सिर्फ़ कार्बन डाइऑक्साइड'], 0,
    'NO₂ is highest along busy roads. It inflames the airways and helps form ozone and fine particles downwind.', 'NO₂ व्यस्त सड़कों के किनारे सबसे ज़्यादा होती है। यह श्वास नलियों में सूजन लाती है और आगे जाकर ओज़ोन और महीन कण बनाती है।'],
  ['Why should you never run an angithi or coal heater in a closed room?', 'बंद कमरे में अंगीठी या कोयला हीटर कभी क्यों नहीं चलाना चाहिए?', ['It wastes coal', 'It releases carbon monoxide, which has no smell and can kill', 'It raises humidity', 'It attracts mosquitoes'], ['कोयला बर्बाद होता है', 'इससे कार्बन मोनोऑक्साइड निकलती है, जिसकी गंध नहीं होती और जो जान ले सकती है', 'नमी बढ़ती है', 'मच्छर आते हैं'], 1,
    'Carbon monoxide binds to blood about 200 times more strongly than oxygen. Every winter it kills people in their sleep in closed rooms.', 'कार्बन मोनोऑक्साइड ऑक्सीजन से लगभग 200 गुना ज़्यादा मज़बूती से खून से जुड़ती है। हर सर्दी बंद कमरों में यह नींद में जान लेती है।'],
  ['How should you size an air purifier for a room?', 'कमरे के लिए एयर प्यूरीफ़ायर का आकार कैसे चुनें?', ['By its wattage', 'By its CADR compared with the room size', 'By the number of filters', 'By its colour of light'], ['वॉट से', 'कमरे के आकार के मुकाबले उसके CADR से', 'फ़िल्टर की संख्या से', 'उसकी लाइट के रंग से'], 1,
    'CADR (clean air delivery rate) says how much clean air it delivers. Aim for at least ⅔ of the floor area in ft² as cfm.', 'CADR (क्लीन एयर डिलीवरी रेट) बताता है कि यह कितनी साफ़ हवा देता है। फ़र्श के क्षेत्रफल (ft²) का कम से कम ⅔ cfm रखें।'],
  ['Who breathes more air for their body weight?', 'शरीर के वज़न के हिसाब से कौन ज़्यादा हवा लेता है?', ['Adults', 'Children', 'Older adults', 'Everyone the same'], ['वयस्क', 'बच्चे', 'बुज़ुर्ग', 'सब बराबर'], 1,
    'Children breathe faster and are more active, so they take in more polluted air per kg, while their lungs are still growing.', 'बच्चे तेज़ साँस लेते हैं और ज़्यादा सक्रिय रहते हैं, इसलिए प्रति kg ज़्यादा प्रदूषित हवा लेते हैं, जबकि उनके फेफड़े अभी बढ़ रहे होते हैं।'],
  ['When does stubble burning in Punjab and Haryana usually peak?', 'पंजाब और हरियाणा में पराली जलाना आमतौर पर कब चरम पर होता है?', ['March–April', 'June–July', 'October–November', 'January'], ['मार्च–अप्रैल', 'जून–जुलाई', 'अक्टूबर–नवंबर', 'जनवरी'], 2,
    'After the rice harvest, fields are cleared for wheat. With north-west winds, the smoke drifts towards Delhi.', 'धान की कटाई के बाद गेहूँ के लिए खेत साफ़ किए जाते हैं। उत्तर-पश्चिमी हवा के साथ धुआँ दिल्ली की ओर आता है।'],
  ['Which is better for dust at home?', 'घर की धूल के लिए क्या बेहतर है?', ['Dry sweeping', 'Wet mopping', 'A ceiling fan on high', 'Opening all windows on a bad day'], ['सूखी झाड़ू', 'गीला पोछा', 'तेज़ पंखा', 'ख़राब दिन सब खिड़कियाँ खोलना'], 1,
    'Dry sweeping throws settled dust back into the air. A damp mop or cloth traps it.', 'सूखी झाड़ू जमी धूल फिर हवा में उड़ा देती है। गीला पोछा या कपड़ा उसे पकड़ लेता है।'],
  ['Stuck in a traffic jam in a car, what helps most?', 'कार में ट्रैफ़िक जाम में क्या सबसे ज़्यादा मदद करता है?', ['Open the windows', 'Switch the AC to recirculation', 'Turn off the fan', 'Spray air freshener'], ['खिड़कियाँ खोलें', 'AC को रीसर्कुलेशन पर करें', 'पंखा बंद करें', 'एयर फ़्रेशनर छिड़कें'], 1,
    'Recirculation stops the car pulling in exhaust from the vehicle in front. Switch back to fresh air once traffic flows.', 'रीसर्कुलेशन आगे की गाड़ी का धुआँ अंदर खींचना रोकता है। ट्रैफ़िक चलने पर फिर ताज़ी हवा पर कर दें।'],
  ['What does NASA FIRMS show?', 'NASA FIRMS क्या दिखाता है?', ['Factory licences', 'Active fires seen by satellites', 'Rainfall', 'Traffic jams'], ['फ़ैक्टरी लाइसेंस', 'उपग्रहों से दिखी सक्रिय आग', 'बारिश', 'ट्रैफ़िक जाम'], 1,
    'Satellites spot the heat of fires several times a day. Saans uses it to show fires upwind of you.', 'उपग्रह दिन में कई बार आग की गर्मी पकड़ते हैं। Saans इससे आपकी हवा की दिशा में लगी आग दिखाता है।'],
  ['Below what ventilation index does pollution tend to stay trapped (IMD)?', 'किस वेंटिलेशन इंडेक्स से नीचे प्रदूषण फँसा रहता है (IMD)?', ['600 m²/s', '6000 m²/s', '60,000 m²/s', 'It never matters'], ['600 m²/s', '6000 m²/s', '60,000 m²/s', 'कोई फ़र्क नहीं पड़ता'], 1,
    'Ventilation index = wind speed × mixing height. Under 6000 m²/s with light winds, pollution builds up near the ground.', 'वेंटिलेशन इंडेक्स = हवा की गति × मिश्रण परत की ऊँचाई। धीमी हवा के साथ 6000 m²/s से कम पर प्रदूषण ज़मीन के पास जमा होता है।'],
  ['Does an N95 mask protect you from ozone or NO₂?', 'क्या N95 मास्क ओज़ोन या NO₂ से बचाता है?', ['Yes, fully', 'No, it filters particles, not gases', 'Only if wet', 'Only at night'], ['हाँ, पूरी तरह', 'नहीं, यह कण रोकता है, गैस नहीं', 'सिर्फ़ गीला होने पर', 'सिर्फ़ रात में'], 1,
    'Particle filters do not stop gases. For ozone, time your outdoor activity for the morning or evening instead.', 'कण वाले फ़िल्टर गैस नहीं रोकते। ओज़ोन के लिए बाहर का काम सुबह या शाम करें।'],
  ['Where in the lungs does PM2.5 settle?', 'PM2.5 फेफड़ों में कहाँ जाकर बैठता है?', ['Only in the nose', 'In the smallest airways and alveoli', 'Only in the throat', 'It never enters the lungs'], ['सिर्फ़ नाक में', 'सबसे छोटी श्वास नलियों और एल्वियोली में', 'सिर्फ़ गले में', 'यह फेफड़ों में जाता ही नहीं'], 1,
    'Fine particles slip past the nose and throat into the alveoli, where oxygen enters the blood; the finest even cross into the bloodstream.', 'महीन कण नाक और गले से बचकर एल्वियोली तक पहुँचते हैं, जहाँ से ऑक्सीजन खून में जाती है; सबसे बारीक खून तक पहुँच जाते हैं।'],
  ['How is the CPCB AQI number decided?', 'CPCB AQI का नंबर कैसे तय होता है?', ['Average of all pollutants', 'The highest sub-index among the pollutants', 'PM10 only', 'Temperature and humidity'], ['सभी प्रदूषकों का औसत', 'प्रदूषकों में सबसे ऊँचा उप-सूचकांक', 'सिर्फ़ PM10', 'तापमान और नमी'], 1,
    'Each pollutant gets its own sub-index; the AQI is the worst one, and that pollutant is called “dominant”.', 'हर प्रदूषक का अपना उप-सूचकांक होता है; AQI सबसे ख़राब वाला होता है, और उस प्रदूषक को “मुख्य” कहा जाता है।'],
  ['Going for a run on a moderate day, which route is better?', 'मध्यम हवा वाले दिन दौड़ने के लिए कौन सा रास्ता बेहतर है?', ['Along the main road', 'Through a park or quiet side streets', 'Behind buses', 'Next to a construction site'], ['मुख्य सड़क के किनारे', 'पार्क या शांत गलियों से', 'बसों के पीछे', 'निर्माण स्थल के पास'], 1,
    'Exposure drops sharply even one street away from heavy traffic, and you breathe deeply while running.', 'भारी ट्रैफ़िक से एक गली दूर ही प्रदूषण काफ़ी कम हो जाता है, और दौड़ते समय आप गहरी साँस लेते हैं।'],
  ['Breathing 22 µg/m³ of PM2.5 for a whole day is roughly like…', 'पूरे दिन 22 µg/m³ PM2.5 में साँस लेना लगभग…', ['Smoking one cigarette', 'Smoking a pack', 'Nothing at all', 'One hour of traffic'], ['एक सिगरेट पीने जैसा', 'एक पैकेट पीने जैसा', 'कुछ भी नहीं', 'एक घंटे के ट्रैफ़िक जैसा'], 0,
    'Berkeley Earth’s rule of thumb: 22 µg/m³ for 24 hours ≈ one cigarette. A 220 µg/m³ day ≈ ten.', 'Berkeley Earth का अनुमान: 24 घंटे 22 µg/m³ ≈ एक सिगरेट। 220 µg/m³ वाला दिन ≈ दस।'],
  ['What usually happens to PM2.5 after steady rain?', 'लगातार बारिश के बाद PM2.5 का क्या होता है?', ['It rises', 'It falls, as rain washes particles out', 'It turns into ozone', 'Nothing changes'], ['बढ़ जाता है', 'घटता है, बारिश कणों को धो देती है', 'ओज़ोन बन जाता है', 'कुछ नहीं बदलता'], 1,
    'Raindrops collect particles on the way down (wet deposition), and rainy weather often brings stronger winds too.', 'बारिश की बूँदें गिरते हुए कण समेट लेती हैं (वेट डिपॉज़िशन), और बारिश के साथ अक्सर तेज़ हवा भी आती है।'],
  ['Which source of SO₂ is the largest in India?', 'भारत में SO₂ का सबसे बड़ा स्रोत क्या है?', ['Coal power plants and industry', 'Indoor plants', 'Electric scooters', 'Rain'], ['कोयला बिजलीघर और उद्योग', 'घर के पौधे', 'इलेक्ट्रिक स्कूटर', 'बारिश'], 0,
    'Burning coal releases sulphur dioxide, which narrows the airways in people with asthma and turns into sulphate particles.', 'कोयला जलाने से सल्फ़र डाइऑक्साइड निकलती है, जो अस्थमा वालों की श्वास नली सिकोड़ती है और सल्फ़ेट कण बनाती है।'],
  ['A mosquito coil burning in a closed bedroom…', 'बंद बेडरूम में जलती मच्छर कॉइल…', ['Is harmless', 'Releases a lot of fine particles where you sleep', 'Cleans the air', 'Only affects mosquitoes'], ['हानिरहित है', 'जहाँ आप सोते हैं वहाँ बहुत सारे महीन कण छोड़ती है', 'हवा साफ़ करती है', 'सिर्फ़ मच्छरों पर असर करती है'], 1,
    'One coil can release as much PM2.5 as many cigarettes. A net or a plug-in repellent is cleaner.', 'एक कॉइल कई सिगरेट जितना PM2.5 छोड़ सकती है। मच्छरदानी या प्लग-इन रिपेलेंट बेहतर हैं।'],
  ['On a “Very Poor” day, what should children do about outdoor play?', '“बहुत ख़राब” दिन बच्चों के बाहर खेलने का क्या करें?', ['Play as usual', 'Move active play indoors', 'Play near the road', 'Play only in the afternoon sun'], ['हमेशा की तरह खेलें', 'दौड़-भाग वाला खेल अंदर करें', 'सड़क के पास खेलें', 'सिर्फ़ दोपहर की धूप में खेलें'], 1,
    'Children breathe more air per kg and their lungs are still growing, so they gain most from cutting hard outdoor activity on bad days.', 'बच्चे प्रति kg ज़्यादा हवा लेते हैं और उनके फेफड़े बढ़ रहे होते हैं, इसलिए ख़राब दिनों में बाहर की मेहनत कम करने से उन्हें सबसे ज़्यादा फ़ायदा है।'],
  ['What is GRAP in Delhi-NCR?', 'दिल्ली-NCR में GRAP क्या है?', ['A new metro line', 'The Graded Response Action Plan: stricter curbs as AQI worsens', 'A mask brand', 'A weather satellite'], ['नई मेट्रो लाइन', 'ग्रेडेड रिस्पॉन्स एक्शन प्लान: AQI बिगड़ने पर सख़्त पाबंदियाँ', 'मास्क का ब्रांड', 'मौसम उपग्रह'], 1,
    'GRAP stages (I–IV) add measures like construction bans and truck limits as the AQI crosses Poor, Very Poor and Severe.', 'GRAP के चरण (I–IV) AQI के ख़राब, बहुत ख़राब और गंभीर होने पर निर्माण रोक और ट्रकों पर पाबंदी जैसे कदम जोड़ते हैं।'],
  ['In homes that cook on wood or dung, the biggest source of smoke is usually…', 'लकड़ी या उपलों पर खाना बनाने वाले घरों में धुएँ का सबसे बड़ा स्रोत आमतौर पर…', ['Traffic outside', 'The chulha itself', 'Paint', 'The refrigerator'], ['बाहर का ट्रैफ़िक', 'ख़ुद चूल्हा', 'पेंट', 'फ़्रिज'], 1,
    'Household solid-fuel smoke is one of India’s largest health risks. LPG, a chimney or cooking with doors open cuts it sharply.', 'घरेलू ठोस ईंधन का धुआँ भारत के सबसे बड़े स्वास्थ्य ख़तरों में है। LPG, चिमनी या दरवाज़े खोलकर पकाने से यह बहुत कम होता है।'],
  ['Which tells you better what you breathe right now on your street?', 'आपकी गली में अभी की हवा कौन बेहतर बताता है?', ['A model with a ~40 km grid', 'A nearby monitor that reported in the last hour', 'Yesterday’s newspaper', 'The sky’s colour'], ['~40 km ग्रिड वाला मॉडल', 'पिछले घंटे में रिपोर्ट करने वाला पास का मॉनिटर', 'कल का अख़बार', 'आसमान का रंग'], 1,
    'Models are good for trends and forecasts; a fresh nearby monitor shows local hot spots. Saans blends both and tells you which it used.', 'मॉडल रुझान और पूर्वानुमान के लिए अच्छे हैं; ताज़ा पास का मॉनिटर स्थानीय हॉटस्पॉट दिखाता है। Saans दोनों मिलाता है और बताता है किसका उपयोग हुआ।'],
  ['What happens to Delhi’s air on Diwali night with heavy firecrackers?', 'भारी आतिशबाज़ी वाली दिवाली रात दिल्ली की हवा का क्या होता है?', ['It improves', 'PM2.5 often spikes several times higher within hours', 'Only ozone changes', 'Nothing measurable'], ['सुधर जाती है', 'PM2.5 अक्सर कुछ घंटों में कई गुना बढ़ जाता है', 'सिर्फ़ ओज़ोन बदलती है', 'कुछ मापने लायक नहीं'], 1,
    'Firecrackers release fine particles and metals into cold, still night air, so levels can jump several-fold by midnight.', 'आतिशबाज़ी ठंडी, शांत रात की हवा में महीन कण और धातुएँ छोड़ती है, इसलिए आधी रात तक स्तर कई गुना बढ़ सकता है।'],
  ['When is the best time to air out your home on a polluted day?', 'प्रदूषित दिन घर में हवा कब आने दें?', ['Late at night', 'During the cleanest hours in the forecast, often early afternoon', 'During the evening rush', 'Never open windows'], ['देर रात', 'पूर्वानुमान के सबसे साफ़ घंटों में, अक्सर दोपहर की शुरुआत में', 'शाम के ट्रैफ़िक के समय', 'खिड़कियाँ कभी न खोलें'], 1,
    'The mixing layer is deepest in the early afternoon, diluting pollution. Saans shows the cleanest hours on Today.', 'दोपहर की शुरुआत में मिश्रण परत सबसे गहरी होती है और प्रदूषण घुल जाता है। Saans “आज” पर सबसे साफ़ घंटे दिखाता है।']
];

const QUIZ_UI = {
  en: { popTitle: 'Challenge of the day', popBody: streak => streak ? `Keep your 🔥 ${streak}-day streak going with today’s air question.` : 'One quick question about the air you breathe. Start a streak today!', play: 'Play', later: 'Later',
    today: 'Today’s question', streak: 'Day streak', best: 'Best', correct: 'Correct', right: 'Correct!', wrong: 'Not quite.', answer: 'Answer', done: 'Come back tomorrow for a new question.',
    past: 'Past questions', practice: 'Practice: does not change your score', last14: 'Last 14 days', try: 'Try it', score: (c, n) => `${c} of ${n} correct` },
  hi: { popTitle: 'आज की चुनौती', popBody: streak => streak ? `आज के सवाल से अपनी 🔥 ${streak} दिन की स्ट्रीक जारी रखें।` : 'आपकी हवा के बारे में एक छोटा सवाल। आज से स्ट्रीक शुरू करें!', play: 'खेलें', later: 'बाद में',
    today: 'आज का सवाल', streak: 'दिन की स्ट्रीक', best: 'सबसे लंबी', correct: 'सही', right: 'सही!', wrong: 'नहीं, सही उत्तर अलग है।', answer: 'उत्तर', done: 'नए सवाल के लिए कल आइए।',
    past: 'पिछले सवाल', practice: 'अभ्यास: आपके स्कोर पर असर नहीं', last14: 'पिछले 14 दिन', try: 'आज़माएँ', score: (c, n) => `${n} में से ${c} सही` }
};

const dayKey = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); }; // YYYY-MM-DD, local
const questionFor = key => Math.floor(Date.parse(`${key}T00:00:00Z`) / 86400000) % QUIZ.length;

function quizState() {
  try { const s = JSON.parse(localStorage.getItem('saans-quiz')); if (s && typeof s.history === 'object') return s; } catch { /* fresh */ }
  return { history: {}, best: 0 };
}
function saveQuiz(state) { try { localStorage.setItem('saans-quiz', JSON.stringify(state)); } catch { /* session only */ } }

// Consecutive played days ending today, or yesterday when today is not played yet.
function quizStreak(history) {
  let offset = history[dayKey()] ? 0 : -1, n = 0;
  while (history[dayKey(offset)]) { n++; offset--; }
  return n;
}

function questionHtml(index, picked, name) {
  const lang = langKey(), t = QUIZ_UI[lang], [qen, qhi, oen, ohi, correct, wen, whi] = QUIZ[index];
  const options = lang === 'hi' ? ohi : oen;
  const answered = picked != null;
  return `<p class="quiz-q">${safeText(lang === 'hi' ? qhi : qen)}</p><div class="quiz-options">${options.map((o, i) => `<button type="button" data-${name}="${i}" ${answered ? 'disabled' : ''} class="quiz-option${answered && i === correct ? ' right' : ''}${answered && i === picked && i !== correct ? ' wrong' : ''}">${safeText(o)}</button>`).join('')}</div>
    ${answered ? `<div class="quiz-why ${picked === correct ? 'ok' : 'no'}"><b>${picked === correct ? t.right : t.wrong}</b> ${safeText(lang === 'hi' ? whi : wen)}</div>` : ''}`;
}

const practice = {};
function renderQuiz() {
  const root = document.querySelector('.quiz-root');
  if (!root) return;
  const t = QUIZ_UI[langKey()], state = quizState(), today = dayKey(), played = state.history[today];
  const streak = quizStreak(state.history), total = Object.values(state.history), right = total.filter(h => h.correct).length;
  const strip = Array.from({ length: 14 }, (_, i) => { const k = dayKey(i - 13), h = state.history[k]; return `<span class="${h ? (h.correct ? 'hit' : 'miss') : ''}${k === today ? ' today' : ''}" title="${k}">${new Date(`${k}T12:00`).getDate()}</span>`; }).join('');
  const past = Array.from({ length: 10 }, (_, i) => dayKey(-1 - i)).map(k => {
    const index = questionFor(k), h = state.history[k], p = practice[k];
    return `<details class="quiz-past"${p != null ? ' open' : ''}><summary><span>${k}</span><b>${safeText(QUIZ[index][langKey() === 'hi' ? 1 : 0])}</b>${h ? `<i class="${h.correct ? 'hit' : 'miss'}">${h.correct ? '✓' : '✗'}</i>` : `<i>${t.try}</i>`}</summary><div data-day="${k}">${questionHtml(index, p, 'practice')}<small class="muted">${t.practice}</small></div></details>`;
  }).join('');
  root.innerHTML = `<div class="quiz-grid"><article class="card quiz-card"><span class="section-kicker">${t.today.toUpperCase()} · ${today}</span>${questionHtml(questionFor(today), played?.choice, 'pick')}${played ? `<p class="muted">${t.done}</p>` : ''}</article>
    <aside class="card streak-card"><div class="streak-flame${streak ? ' lit' : ''}">🔥<b>${streak}</b></div><small>${t.streak}</small><div class="streak-stats"><span>${t.best} <b>${Math.max(state.best || 0, streak)}</b></span><span>${t.score(right, total.length)}</span></div><span class="section-kicker">${t.last14}</span><div class="streak-strip">${strip}</div></aside></div>
    <h3 class="quiz-past-title">${t.past}</h3><div class="quiz-past-list">${past}</div>`;
  root.onclick = event => {
    const pick = event.target.closest('[data-pick]'), prac = event.target.closest('[data-practice]');
    if (pick && !quizState().history[today]) {
      const s = quizState(), choice = Number(pick.dataset.pick);
      s.history[today] = { q: questionFor(today), choice, correct: choice === QUIZ[questionFor(today)][4] };
      s.best = Math.max(s.best || 0, quizStreak(s.history));
      saveQuiz(s);
      renderQuiz();
    }
    if (prac) { practice[prac.closest('[data-day]').dataset.day] = Number(prac.dataset.practice); renderQuiz(); }
  };
}

// Once a day on entering the app: offer today's challenge if it is not played yet.
function maybeShowQuizPopup() {
  const today = dayKey();
  let asked = null;
  try { asked = localStorage.getItem('saans-quiz-asked'); localStorage.setItem('saans-quiz-asked', today); } catch { /* ask every visit */ }
  const state = quizState();
  if (asked === today || state.history[today] || document.getElementById('quizPop')) return;
  const t = QUIZ_UI[langKey()];
  const pop = document.createElement('div');
  pop.id = 'quizPop';
  pop.className = 'quiz-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-modal', 'true');
  pop.setAttribute('aria-labelledby', 'quizPopTitle');
  pop.innerHTML = `<div class="quiz-pop-card"><div class="streak-flame${quizStreak(state.history) ? ' lit' : ''}">🔥<b>${quizStreak(state.history)}</b></div><h3 id="quizPopTitle">${t.popTitle}</h3><p>${t.popBody(quizStreak(state.history))}</p><div class="quiz-pop-actions"><button type="button" class="text-button" data-later>${t.later}</button><button type="button" class="next-button" data-play>${t.play} <span>→</span></button></div></div>`;
  const close = () => pop.remove();
  pop.addEventListener('click', event => {
    if (event.target.closest('[data-play]')) { close(); location.hash = '#challenge'; }
    else if (event.target.closest('[data-later]') || event.target === pop) close();
  });
  pop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.body.append(pop);
  pop.querySelector('[data-play]').focus();
}
