// Hourly email alerts: one SNS topic, each subscriber's email subscription filtered to their own message attribute,
// so a single Publish reaches exactly one inbox. A Step Functions state machine (template.yaml) runs them at :05 every hour.
import { createHash } from 'node:crypto';
import { SubscribeCommand, PublishCommand, GetSubscriptionAttributesCommand } from '@aws-sdk/client-sns';
import { ScanCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { actionsFor, PROFILES, CONDITIONS } from './guidance.mjs';
import { haversineKm } from './sources.mjs';

export const MAX_SUBSCRIBERS = 500;
export const FREQUENCIES = ['hourly', 'changes'];
export const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
export const subscriberId = email => createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 20);

const localHour = (now, timeZone) => {
  try { return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now)); }
  catch { return now.getUTCHours(); }
};
const hhmm = time => time?.slice(11, 16) || '';

// Quiet 22:00–06:59 local, unless the air has just turned very poor or severe. "changes" mails only when the AQI band moves.
export function shouldSend(sub, air, now = new Date()) {
  const band = air.aqi?.band?.index ?? air.guidance?.band?.index;
  if (band == null) return false;
  const changed = sub.lastBand == null || Number(sub.lastBand) !== band;
  const hour = localHour(now, air.location?.timezone || 'Asia/Kolkata');
  if (hour >= 22 || hour < 7) return changed && band >= 4;
  return sub.freq === 'changes' ? changed : true;
}

const T = {
  en: { main: 'main pollutant', trend: ['Getting better over the next 3 hours.', 'About the same for the next 3 hours.', 'Getting worse over the next 3 hours.'],
    clean: 'Cleanest stretch in the next 12 hours', todo: 'What to do', fires: n => `${n} farm or forest fires upwind of you in the last 24 hours.`,
    open: 'Open Saans', stop: 'To stop these emails, use the unsubscribe link at the bottom.' },
  hi: { main: 'मुख्य प्रदूषक', trend: ['अगले 3 घंटों में सुधार होगा।', 'अगले 3 घंटों में लगभग ऐसी ही रहेगी।', 'अगले 3 घंटों में और ख़राब होगी।'],
    clean: 'अगले 12 घंटों में सबसे साफ़ समय', todo: 'क्या करें', fires: n => `पिछले 24 घंटों में आपकी हवा की दिशा में ${n} खेत या जंगल की आग।`,
    open: 'Saans खोलें', stop: 'ये ईमेल बंद करने के लिए नीचे दिए unsubscribe लिंक का उपयोग करें।' }
};

// { subject, text } in the subscriber's language; the subject stays ASCII because SNS requires it.
export function alertMessage(sub, air) {
  const lang = sub.lang === 'hi' ? 'hi' : 'en', t = T[lang];
  const aqi = air.aqi, band = aqi?.band || air.guidance?.band;
  const place = String(sub.place || '').replace(/[^\x20-\x7E]/g, '').trim() || 'your area';
  const value = aqi?.value ?? Math.round(air.estimate?.pm2_5);
  const unit = aqi ? 'AQI' : 'PM2.5';
  const next = (air.forecast || []).slice(0, 13).filter(p => Number.isFinite(p.aqi));
  const label = l => band.label?.[l] ?? band.label;
  const lines = [`${unit} ${value} (${label(lang)})${aqi?.dominantName ? `, ${t.main} ${aqi.dominantName}` : ''}.`];
  if (next.length > 3) {
    const d = next[3].aqi - next[0].aqi;
    lines.push(t.trend[d < -10 ? 0 : d > 10 ? 2 : 1]);
    const best = next.reduce((a, b) => b.aqi < a.aqi ? b : a);
    lines.push(`${t.clean}: ${hhmm(best.time)} (AQI ~${best.aqi}).`);
  }
  const todo = actionsFor(band.index, sub.profile || 'general', sub.conditions || [])[lang].slice(0, 6);
  lines.push('', `${t.todo}:`, ...todo.map(x => `- ${x}`));
  if (air.fires?.state === 'available' && air.fires.count > 0) lines.push('', t.fires(air.fires.count));
  if (process.env.APP_URL) lines.push('', `${t.open}: ${process.env.APP_URL}`);
  lines.push('', t.stop);
  return { subject: `Saans: ${unit} ${value} ${label('en')} in ${place}`.slice(0, 99), text: lines.join('\n') };
}

// body: { email, lat, lon, place, profile, conditions, lang, freq } with coords already validated by the caller.
export async function subscribe({ ddb, sns, table, topic }, body, coords) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return { status: 400, body: { error: 'invalid_email', message: 'Enter a valid email address.' } };
  const existing = await ddb.send(new ScanCommand({ TableName: table, Select: 'COUNT' }));
  if (existing.Count >= MAX_SUBSCRIBERS) {
    const known = await ddb.send(new ScanCommand({ TableName: table, Select: 'COUNT', FilterExpression: 'email = :e', ExpressionAttributeValues: { ':e': email } }));
    if (!known.Count) return { status: 429, body: { error: 'full', message: 'Alerts are full for now. Please try again later.' } };
  }
  const id = subscriberId(email);
  // Same email + same filter policy = SNS returns the existing subscription, so re-subscribing just updates preferences.
  const { SubscriptionArn } = await sns.send(new SubscribeCommand({ TopicArn: topic, Protocol: 'email', Endpoint: email, ReturnSubscriptionArn: true,
    Attributes: { FilterPolicy: JSON.stringify({ sub: [id] }), FilterPolicyScope: 'MessageAttributes' } }));
  await ddb.send(new PutCommand({ TableName: table, Item: { email, id, subscriptionArn: SubscriptionArn, latitude: coords.latitude, longitude: coords.longitude,
    place: String(body.place || '').slice(0, 60), profile: PROFILES.includes(body.profile) ? body.profile : 'general',
    conditions: Array.isArray(body.conditions) ? body.conditions.filter(c => CONDITIONS.includes(c)) : [],
    lang: body.lang === 'hi' ? 'hi' : 'en', freq: FREQUENCIES.includes(body.freq) ? body.freq : 'hourly', createdAt: new Date().toISOString() } }));
  return { status: 200, body: { state: 'pending_confirmation', message: 'Check your inbox and click the AWS confirmation link to start alerts.' } };
}

// Step Functions task 1: every subscriber's email (the Map state then runs alertOne per email).
export async function listSubscribers({ ddb, table }) {
  const emails = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: table, ProjectionExpression: 'email', ExclusiveStartKey }));
    emails.push(...(page.Items || []).map(item => item.email));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return emails;
}

// Step Functions task 2, one subscriber: 'sent' | 'pending' | 'removed' | 'skipped'. Errors before Publish throw so the
// state machine can retry; after Publish they are only logged, so a retry never sends the same alert twice.
export async function alertOne({ ddb, sns, table, topic, getAir }, email, now = new Date()) {
  const { Item: sub } = await ddb.send(new GetCommand({ TableName: table, Key: { email } }));
  if (!sub) return 'removed';
  const attrs = await sns.send(new GetSubscriptionAttributesCommand({ SubscriptionArn: sub.subscriptionArn })).catch(error => {
    if (error.name === 'NotFoundException' || error.name === 'InvalidParameterException') return null;
    throw error;
  });
  if (!attrs) { await ddb.send(new DeleteCommand({ TableName: table, Key: { email } })); return 'removed'; }
  if (attrs.Attributes?.PendingConfirmation === 'true') return 'pending';
  const { payload } = await getAir({ latitude: Number(sub.latitude), longitude: Number(sub.longitude) });
  if (!shouldSend(sub, payload, now)) return 'skipped';
  const { subject, text } = alertMessage(sub, payload);
  await sns.send(new PublishCommand({ TopicArn: topic, Subject: subject, Message: text, MessageAttributes: { sub: { DataType: 'String', StringValue: sub.id } } }));
  await ddb.send(new UpdateCommand({ TableName: table, Key: { email }, UpdateExpression: 'SET lastBand = :b, lastSentAt = :t',
    ExpressionAttributeValues: { ':b': payload.aqi?.band?.index ?? payload.guidance?.band?.index, ':t': now.toISOString() } }))
    .catch(error => console.error('Alert sent but not recorded', sub.id, error.name));
  return 'sent';
}

// ---- Government advisory broadcast (simulated) ----
// The government view sends one advisory for an area: every subscriber within ADVISORY_KM gets it by email (their
// language first, then the other), and anyone opening Saans nearby sees it on Today for ADVISORY_HOURS.
// The text is built on the server from live data (no free text), and one advisory every ADVISORY_GAP_S stops spam.
export const ADVISORY_KM = 5, ADVISORY_HOURS = 6, ADVISORY_GAP_S = 300;
const ADVISORY_KEY = 'advisories#v1';
let advisoriesLocal = []; // no cache table (local dev)

export function advisoryText(air, place) {
  const aqi = air.aqi, band = aqi?.band || air.guidance?.band;
  if (!band) return null;
  const value = aqi?.value ?? Math.round(air.estimate?.pm2_5), unit = aqi ? 'AQI' : 'PM2.5';
  const label = l => band.label?.[l] ?? band.label;
  const general = actionsFor(band.index, 'general'), sensitive = actionsFor(band.index, 'heart_lung');
  const build = (l, head, everyone, groups, dom) => {
    const extra = sensitive[l].filter(x => !general[l].includes(x)).slice(0, 3);
    return { title: head, text: [head, `${unit} ${value} (${label(l)})${aqi?.dominantName ? `, ${dom} ${aqi.dominantName}` : ''}.`, '', `${everyone}:`, ...general[l].slice(0, 4).map(x => `- ${x}`),
      ...(extra.length ? ['', `${groups}:`, ...extra.map(x => `- ${x}`)] : [])].join('\n') };
  };
  const ascii = String(place || '').replace(/[^\x20-\x7E]/g, '').trim() || 'your area';
  return { band: band.index, color: band.color, unit, value,
    subject: `Saans advisory (simulated): ${unit} ${value} ${label('en')} in ${ascii}`.slice(0, 99),
    en: build('en', `Air quality advisory for ${place} (simulated, from the Saans government view)`, 'Everyone', 'Children, older adults and people with asthma or heart disease', 'mainly'),
    hi: build('hi', `${place} के लिए वायु गुणवत्ता परामर्श (सिम्युलेटेड, Saans सरकारी व्यू से)`, 'सभी के लिए', 'बच्चे, बुज़ुर्ग और अस्थमा या हृदय रोग वाले', 'मुख्य प्रदूषक') };
}

const near = (coords, item, km) => haversineKm(coords, { latitude: Number(item.latitude), longitude: Number(item.longitude) }) <= km;
export const advisoriesNear = (list, coords, now = Date.now()) => list.filter(a => a.expiresAt > now && near(coords, a, a.radiusKm)).slice(0, 3);

export async function readAdvisories({ ddb, cacheTable }) {
  if (!cacheTable) return advisoriesLocal;
  const { Item } = await ddb.send(new GetCommand({ TableName: cacheTable, Key: { cacheKey: ADVISORY_KEY } }));
  return Item?.payload || [];
}

async function subscribersNear({ ddb, table }, coords) {
  const subs = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    subs.push(...(page.Items || []).filter(s => near(coords, s, ADVISORY_KM)));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return subs;
}
export const countSubscribersNear = async (env, coords) => (await subscribersNear(env, coords)).length;

export async function sendAdvisory(env, coords, place, now = Date.now()) {
  const { ddb, sns, topic, cacheTable, getAir } = env;
  const list = (await readAdvisories(env)).filter(a => a.expiresAt > now);
  const waitS = list.length ? ADVISORY_GAP_S - Math.floor((now - Date.parse(list[0].issuedAt)) / 1000) : 0;
  if (waitS > 0) return { status: 429, body: { error: 'too_soon', message: `One advisory every ${ADVISORY_GAP_S / 60} minutes. Try again in ${Math.ceil(waitS / 60)} min.`, retryAfter: waitS } };
  const { payload } = await getAir(coords);
  const text = advisoryText(payload, place);
  if (!text) return { status: 502, body: { error: 'no_data', message: 'No live reading for this place right now.' } };
  const subs = await subscribersNear(env, coords);
  let sent = 0;
  for (const sub of subs) {
    const [first, second] = sub.lang === 'hi' ? [text.hi, text.en] : [text.en, text.hi];
    try {
      await sns.send(new PublishCommand({ TopicArn: topic, Subject: text.subject, Message: `${first.text}\n\n----\n\n${second.text}\n\n${T[sub.lang === 'hi' ? 'hi' : 'en'].stop}`,
        MessageAttributes: { sub: { DataType: 'String', StringValue: sub.id } } }));
      sent++;
    } catch (error) { console.error('Advisory publish failed', sub.id, error.name); }
  }
  const advisory = { id: now.toString(36), latitude: coords.latitude, longitude: coords.longitude, place: String(place).slice(0, 60), radiusKm: ADVISORY_KM,
    issuedAt: new Date(now).toISOString(), expiresAt: now + ADVISORY_HOURS * 3600e3, band: text.band, color: text.color, unit: text.unit, value: text.value, en: text.en, hi: text.hi, recipients: sent };
  const next = [advisory, ...list].slice(0, 5);
  if (cacheTable) await ddb.send(new PutCommand({ TableName: cacheTable, Item: { cacheKey: ADVISORY_KEY, payload: next, expiresAt: Math.floor(now / 1000) + ADVISORY_HOURS * 3600 } }));
  else advisoriesLocal = next;
  return { status: 200, body: { advisory, recipients: sent, subscribersNearby: subs.length } };
}
