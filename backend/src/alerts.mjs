// Hourly email alerts: one SNS topic, each subscriber's email subscription filtered to their own message attribute,
// so a single Publish reaches exactly one inbox. A Step Functions state machine (template.yaml) runs them at :05 every hour.
import { createHash } from 'node:crypto';
import { SubscribeCommand, PublishCommand, GetSubscriptionAttributesCommand } from '@aws-sdk/client-sns';
import { ScanCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { actionsFor, PROFILES, CONDITIONS } from './guidance.mjs';

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
