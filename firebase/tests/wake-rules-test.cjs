const fs = require('fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-mushafi', firestore: { host: '127.0.0.1', port: 8085, rules: fs.readFileSync('../firestore.rules', 'utf8') } });
  await env.clearFirestore();
  const A = env.authenticatedContext('waker-a').firestore(), B = env.authenticatedContext('sleeper-b').firestore(), C = env.authenticatedContext('stranger-c').firestore(), anon = env.unauthenticatedContext().firestore();
  const week = () => Timestamp.fromMillis(Date.now() + 7 * 86400000);
  // profiles
  await assertSucceeds(setDoc(doc(B, 'wakeProfiles/sleeper-b'), { name: 'B', token: 'tok', platform: 'android', language: 'ar', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(A, 'wakeProfiles/sleeper-b'), { name: 'X', token: 'evil', platform: 'android', language: 'ar', updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(A, 'wakeProfiles/sleeper-b')));
  // invites
  await assertSucceeds(setDoc(doc(A, 'wakeInvites/abcdefghij'), { from: 'waker-a', fromName: 'A', createdAt: serverTimestamp(), expiresAt: week() }));
  await assertFails(setDoc(doc(C, 'wakeInvites/zzzzzzzzzz'), { from: 'waker-a', fromName: 'A', createdAt: serverTimestamp(), expiresAt: week() }));
  await assertFails(setDoc(doc(A, 'wakeInvites/longlived1'), { from: 'waker-a', fromName: 'A', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 40 * 86400000) }));
  await assertSucceeds(getDoc(doc(B, 'wakeInvites/abcdefghij')));
  await assertFails(getDoc(doc(anon, 'wakeInvites/abcdefghij')));
  // a call before consent fails
  const ring = (from, to) => ({ from, to, fromName: 'A', state: 'ringing', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await assertFails(setDoc(doc(A, 'wakeCalls/c0'), ring('waker-a', 'sleeper-b')));
  // B accepts: writes both sides
  await assertSucceeds(setDoc(doc(B, 'wakePeers/sleeper-b/list/waker-a'), { role: 'wakesMe', name: 'A', invite: 'abcdefghij', since: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(B, 'wakePeers/waker-a/list/sleeper-b'), { role: 'canWake', name: 'B', invite: 'abcdefghij', since: serverTimestamp() }));
  // C cannot forge consent with A's invite for B, nor plant itself as allowed waker of B
  await assertFails(setDoc(doc(C, 'wakePeers/sleeper-b/list/stranger-c'), { role: 'wakesMe', name: 'C', invite: 'abcdefghij', since: serverTimestamp() }));
  await assertFails(setDoc(doc(C, 'wakePeers/sleeper-b/list/waker-a'), { role: 'wakesMe', name: 'A', invite: 'abcdefghij', since: serverTimestamp() }));
  await assertFails(setDoc(doc(A, 'wakePeers/sleeper-b/list/waker-a'), { role: 'wakesMe', name: 'A', invite: 'abcdefghij', since: serverTimestamp() }));
  // A rings B
  await assertSucceeds(setDoc(doc(A, 'wakeCalls/c1'), ring('waker-a', 'sleeper-b')));
  await assertFails(setDoc(doc(C, 'wakeCalls/c2'), ring('stranger-c', 'sleeper-b')));
  await assertFails(setDoc(doc(C, 'wakeCalls/c3'), ring('waker-a', 'sleeper-b')));
  await assertSucceeds(getDoc(doc(B, 'wakeCalls/c1')));
  await assertFails(getDoc(doc(C, 'wakeCalls/c1')));
  // B answers; afterwards nothing changes
  await assertFails(updateDoc(doc(A, 'wakeCalls/c1'), { state: 'answered', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(B, 'wakeCalls/c1'), { state: 'answered', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(A, 'wakeCalls/c1'), { state: 'cancelled', updatedAt: serverTimestamp() }));
  // caller cancels a new ring; callee cannot pretend cancel
  await assertSucceeds(setDoc(doc(A, 'wakeCalls/c4'), ring('waker-a', 'sleeper-b')));
  await assertFails(updateDoc(doc(B, 'wakeCalls/c4'), { state: 'cancelled', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(A, 'wakeCalls/c4'), { state: 'cancelled', updatedAt: serverTimestamp(), to: 'x' }));
  await assertSucceeds(updateDoc(doc(A, 'wakeCalls/c4'), { state: 'cancelled', updatedAt: serverTimestamp() }));
  // B removes A: ringing no longer allowed
  await assertSucceeds(deleteDoc(doc(B, 'wakePeers/sleeper-b/list/waker-a')));
  await assertFails(setDoc(doc(A, 'wakeCalls/c5'), ring('waker-a', 'sleeper-b')));
  await assertSucceeds(deleteDoc(doc(A, 'wakePeers/waker-a/list/sleeper-b')));
  await env.cleanup();
  console.log('PASS: wake rules');
})().catch(e => { console.error(e); process.exit(1) });
