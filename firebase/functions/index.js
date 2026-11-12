'use strict';
// صحبة الفجر: pushes for in-app wake rings. Clients write wakeCalls; this only delivers pushes.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const TEXT = {
  ar: { title: 'صحبة الفجر', ring: '{0} يصحّيك للفجر', missed: 'مكالمة صحبة فائتة من {0}', answer: 'ردّ', decline: 'رفض' },
  en: { title: 'Fajr Companion', ring: '{0} is waking you for Fajr', missed: 'Missed wake-up call from {0}', answer: 'Answer', decline: 'Decline' },
  ur: { title: 'فجر کی رفاقت', ring: '{0} آپ کو فجر کے لیے جگا رہے ہیں', missed: '{0} کی رفاقت کال چھوٹ گئی', answer: 'جواب دیں', decline: 'رد کریں' },
  bn: { title: 'ফজরের সঙ্গী', ring: '{0} আপনাকে ফজরে জাগাচ্ছেন', missed: '{0}-এর মিসড কল', answer: 'ধরুন', decline: 'কেটে দিন' },
  tr: { title: 'Sabah Arkadaşı', ring: '{0} seni sabah namazına kaldırıyor', missed: '{0} cevapsız uyandırma araması', answer: 'Aç', decline: 'Reddet' },
};
const t = (lang, key, name) => (TEXT[lang] || TEXT.ar)[key].replace('{0}', name);

async function profile(uid) {
  const snap = await db.doc(`wakeProfiles/${uid}`).get();
  return snap.exists ? snap.data() : null;
}

async function send(uid, p, message) {
  if (!p?.token || !message) return;
  try { await admin.messaging().send({ token: p.token, ...message }) }
  catch (e) {
    if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(e.code)) {
      await db.doc(`wakeProfiles/${uid}`).update({ token: null }).catch(() => {});
    }
    functions.logger.warn('push failed', e.code || e.message);
  }
}

function ringMessage(p, callId, call) {
  const name = String(call.fromName || '').slice(0, 60), lang = p.language || 'ar';
  const data = { type: 'wake', callId, fromName: name, at: String(Date.now()) };
  if (p.platform === 'ios') {
    return {
      data,
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': callId, 'apns-expiration': String(Math.floor(Date.now() / 1000) + 60) },
        payload: { aps: { alert: { title: t(lang, 'title', name), body: t(lang, 'ring', name) }, sound: 'wake-ring.caf', category: 'WAKE_CALL', 'interruption-level': 'time-sensitive', 'thread-id': 'wake' } },
      },
    };
  }
  return { data, android: { priority: 'high', ttl: 60 * 1000 } };
}

function endMessage(p, callId, call, state) {
  const name = String(call.fromName || '').slice(0, 60), lang = p.language || 'ar';
  const data = { type: 'wakeEnd', callId, state, fromName: name };
  if (p.platform === 'ios') {
    if (state !== 'missed' && state !== 'cancelled') return null;
    return {
      data,
      apns: {
        headers: { 'apns-priority': '10', 'apns-push-type': 'alert', 'apns-collapse-id': callId },
        payload: { aps: { alert: { title: t(lang, 'title', name), body: t(lang, 'missed', name) }, sound: 'default', 'thread-id': 'wake' } },
      },
    };
  }
  return { data, android: { priority: 'high', ttl: 10 * 60 * 1000 } };
}

exports.wakeRing = functions.firestore.document('wakeCalls/{callId}').onCreate(async (snap, ctx) => {
  const call = snap.data();
  if (call.state !== 'ringing') return;
  const p = await profile(call.to);
  if (!p) { await snap.ref.update({ state: 'unreachable', updatedAt: admin.firestore.FieldValue.serverTimestamp() }); return }
  await send(call.to, p, ringMessage(p, ctx.params.callId, call));
});

exports.wakeEnd = functions.firestore.document('wakeCalls/{callId}').onUpdate(async (change, ctx) => {
  const before = change.before.data(), after = change.after.data();
  if (before.state !== 'ringing' || after.state === 'ringing') return;
  if (!['missed', 'cancelled', 'answered', 'declined'].includes(after.state)) return;
  const p = await profile(after.to);
  const message = p && endMessage(p, ctx.params.callId, after, after.state);
  if (message) await send(after.to, p, message);
});

// Old rings and invites are cleared once a day.
exports.wakeCleanup = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 86400000);
  const calls = await db.collection('wakeCalls').where('createdAt', '<', cutoff).limit(400).get();
  const invites = await db.collection('wakeInvites').where('expiresAt', '<', admin.firestore.Timestamp.now()).limit(400).get();
  const batch = db.batch();
  calls.forEach(d => batch.delete(d.ref)); invites.forEach(d => batch.delete(d.ref));
  if (!calls.empty || !invites.empty) await batch.commit();
});
