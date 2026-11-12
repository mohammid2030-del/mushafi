package com.mushafi.app;

import android.content.Context;
import com.google.firebase.FirebaseApp;
import com.google.firebase.Timestamp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.*;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.*;
import java.security.SecureRandom;
import java.util.*;

/**
 * صحبة الفجر between Mushafi users: invites, the people on each side, and rings.
 * Every result goes back to the page as JSON through {@link Sink}.
 */
final class WakeClient {
 interface Sink { void send(String callback, String json); }

 static final int RING_SECONDS = 45;
 private final Context context;
 private final Sink sink;
 private final Map<String, ListenerRegistration> calls = new HashMap<>();
 private final Map<String, Runnable> timeouts = new HashMap<>();
 private final android.os.Handler main = new android.os.Handler(android.os.Looper.getMainLooper());

 WakeClient(Context c, Sink sink) { context = c.getApplicationContext(); this.sink = sink; if (FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context); }

 static FirebaseUser user() { try { return FirebaseAuth.getInstance().getCurrentUser(); } catch (Exception e) { return null; } }
 static String displayName(FirebaseUser u) { String n = u == null ? null : u.getDisplayName(); if (n == null || n.trim().isEmpty()) n = u == null ? "" : (u.getEmail() == null ? "" : u.getEmail().split("@")[0]); n = n.trim(); return n.length() > 60 ? n.substring(0, 60) : (n.isEmpty() ? "مستخدم مصحفي" : n); }
 private FirebaseFirestore db() { return FirebaseFirestore.getInstance(); }

 private void reply(String callback, JSONObject j) { sink.send(callback, j.toString()); }
 private void fail(String callback, String code, Exception e) { try { JSONObject j = new JSONObject().put("error", code); if (e instanceof FirebaseFirestoreException) j.put("detail", ((FirebaseFirestoreException) e).getCode().name()); reply(callback, j); } catch (JSONException ignored) {} }

 /** Status for the page. */
 String status() {
  FirebaseUser u = user();
  try {
   return new JSONObject().put("signedIn", u != null).put("uid", u == null ? "" : u.getUid()).put("name", u == null ? "" : displayName(u))
    .put("notifications", PrayerScheduler.notifications(context)).put("token", context.getSharedPreferences("wake", 0).getString("token", "").length() > 0).toString();
  } catch (JSONException e) { return "{}"; }
 }

 /** Publish this device so others can ring it. */
 void register() {
  final FirebaseUser u = user(); if (u == null) return;
  try { FirebaseMessaging.getInstance().setAutoInitEnabled(true); } catch (Exception ignored) {}
  FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
   context.getSharedPreferences("wake", 0).edit().putString("token", token).apply();
   Map<String, Object> p = new HashMap<>();
   p.put("name", displayName(u)); p.put("token", token); p.put("platform", "android");
   p.put("language", UiLocale.language(context)); p.put("updatedAt", FieldValue.serverTimestamp());
   db().collection("wakeProfiles").document(u.getUid()).set(p);
  });
 }

 static void tokenRefreshed(Context c, String token) {
  c.getSharedPreferences("wake", 0).edit().putString("token", token).apply();
  FirebaseUser u = user(); if (u == null) return;
  Map<String, Object> p = new HashMap<>();
  p.put("name", displayName(u)); p.put("token", token); p.put("platform", "android");
  p.put("language", UiLocale.language(c)); p.put("updatedAt", FieldValue.serverTimestamp());
  try { FirebaseFirestore.getInstance().collection("wakeProfiles").document(u.getUid()).set(p); } catch (Exception ignored) {}
 }

 private static final String ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
 private static String code() { SecureRandom r = new SecureRandom(); StringBuilder b = new StringBuilder(); for (int i = 0; i < 10; i++) b.append(ALPHABET.charAt(r.nextInt(ALPHABET.length()))); return b.toString(); }

 void createInvite() {
  final FirebaseUser u = user(); if (u == null) { fail("onWakeInvite", "signin", null); return; }
  final String code = code();
  Map<String, Object> d = new HashMap<>();
  d.put("from", u.getUid()); d.put("fromName", displayName(u)); d.put("createdAt", FieldValue.serverTimestamp());
  d.put("expiresAt", new Timestamp(new Date(System.currentTimeMillis() + 7L * 86400000L)));
  db().collection("wakeInvites").document(code).set(d)
   .addOnSuccessListener(x -> { try { reply("onWakeInvite", new JSONObject().put("code", code).put("name", displayName(u))); } catch (JSONException ignored) {} })
   .addOnFailureListener(e -> fail("onWakeInvite", "network", e));
 }

 void acceptInvite(String raw) {
  final FirebaseUser u = user(); if (u == null) { fail("onWakeAccept", "signin", null); return; }
  final String code = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
  if (!code.matches("[a-z0-9]{10}")) { fail("onWakeAccept", "code", null); return; }
  db().collection("wakeInvites").document(code).get().addOnSuccessListener(snap -> {
   if (!snap.exists()) { fail("onWakeAccept", "code", null); return; }
   String from = snap.getString("from"), fromName = snap.getString("fromName");
   Timestamp exp = snap.getTimestamp("expiresAt");
   if (from == null || exp == null || exp.toDate().getTime() < System.currentTimeMillis()) { fail("onWakeAccept", "expired", null); return; }
   if (from.equals(u.getUid())) { fail("onWakeAccept", "self", null); return; }
   WriteBatch batch = db().batch();
   Map<String, Object> mine = new HashMap<>(); mine.put("role", "wakesMe"); mine.put("name", fromName == null ? "" : fromName); mine.put("invite", code); mine.put("since", FieldValue.serverTimestamp());
   Map<String, Object> theirs = new HashMap<>(); theirs.put("role", "canWake"); theirs.put("name", displayName(u)); theirs.put("invite", code); theirs.put("since", FieldValue.serverTimestamp());
   batch.set(db().collection("wakePeers").document(u.getUid()).collection("list").document(from), mine);
   batch.set(db().collection("wakePeers").document(from).collection("list").document(u.getUid()), theirs);
   batch.commit().addOnSuccessListener(x -> { register(); try { reply("onWakeAccept", new JSONObject().put("ok", true).put("name", fromName == null ? "" : fromName)); } catch (JSONException ignored) {} })
    .addOnFailureListener(e -> fail("onWakeAccept", "network", e));
  }).addOnFailureListener(e -> fail("onWakeAccept", "network", e));
 }

 void peers() {
  final FirebaseUser u = user(); if (u == null) { fail("onWakePeers", "signin", null); return; }
  db().collection("wakePeers").document(u.getUid()).collection("list").get().addOnSuccessListener(q -> {
   JSONArray list = new JSONArray();
   for (DocumentSnapshot d : q.getDocuments()) {
    try { Timestamp since = d.getTimestamp("since"); list.put(new JSONObject().put("uid", d.getId()).put("name", d.getString("name")).put("role", d.getString("role")).put("since", since == null ? 0 : since.toDate().getTime())); } catch (JSONException ignored) {}
   }
   try { reply("onWakePeers", new JSONObject().put("list", list)); } catch (JSONException ignored) {}
  }).addOnFailureListener(e -> fail("onWakePeers", "network", e));
 }

 void removePeer(String peer) {
  final FirebaseUser u = user(); if (u == null || peer == null || !peer.matches("[A-Za-z0-9]{6,128}")) return;
  WriteBatch batch = db().batch();
  batch.delete(db().collection("wakePeers").document(u.getUid()).collection("list").document(peer));
  batch.delete(db().collection("wakePeers").document(peer).collection("list").document(u.getUid()));
  batch.commit().addOnCompleteListener(t -> { try { reply("onWakeRemoved", new JSONObject().put("uid", peer).put("ok", t.isSuccessful())); } catch (JSONException ignored) {} });
 }

 /** Ring one person; state changes come back through onWakeCall. */
 void ring(String peer, String token) {
  final FirebaseUser u = user();
  if (u == null || peer == null || !peer.matches("[A-Za-z0-9]{6,128}")) { emitCall(token, "", "failed", "signin"); return; }
  final DocumentReference ref = db().collection("wakeCalls").document();
  Map<String, Object> d = new HashMap<>();
  d.put("from", u.getUid()); d.put("to", peer); d.put("fromName", displayName(u)); d.put("state", "ringing");
  d.put("createdAt", FieldValue.serverTimestamp()); d.put("updatedAt", FieldValue.serverTimestamp());
  ref.set(d).addOnSuccessListener(x -> {
   emitCall(token, ref.getId(), "ringing", null);
   ListenerRegistration l = ref.addSnapshotListener((snap, err) -> {
    if (err != null || snap == null || !snap.exists()) return;
    String state = snap.getString("state");
    if (state == null || "ringing".equals(state)) return;
    stop(ref.getId());
    emitCall(token, ref.getId(), state, null);
   });
   calls.put(ref.getId(), l);
   Runnable timeout = () -> ref.update("state", "missed", "updatedAt", FieldValue.serverTimestamp());
   timeouts.put(ref.getId(), timeout);
   main.postDelayed(timeout, RING_SECONDS * 1000L);
  }).addOnFailureListener(e -> emitCall(token, "", "failed", e instanceof FirebaseFirestoreException && ((FirebaseFirestoreException) e).getCode() == FirebaseFirestoreException.Code.PERMISSION_DENIED ? "permission" : "network"));
 }

 void cancel(String callId) {
  if (callId == null || !callId.matches("[A-Za-z0-9]{10,40}")) return;
  db().collection("wakeCalls").document(callId).update("state", "cancelled", "updatedAt", FieldValue.serverTimestamp());
 }

 private void stop(String callId) {
  ListenerRegistration l = calls.remove(callId); if (l != null) l.remove();
  Runnable t = timeouts.remove(callId); if (t != null) main.removeCallbacks(t);
 }

 void close() { for (String id : new ArrayList<>(calls.keySet())) stop(id); }

 private void emitCall(String token, String callId, String state, String reason) {
  try { JSONObject j = new JSONObject().put("token", token == null ? "" : token).put("callId", callId).put("state", state); if (reason != null) j.put("reason", reason); reply("onWakeCall", j); } catch (JSONException ignored) {}
 }

 /** The person being woken answers or declines (from the ring screen or the notification). */
 static void respond(Context c, String callId, String state) {
  if (callId == null || !callId.matches("[A-Za-z0-9]{10,40}") || !Arrays.asList("answered", "declined", "missed").contains(state)) return;
  if (FirebaseApp.getApps(c).isEmpty()) FirebaseApp.initializeApp(c);
  if (user() == null) return;
  FirebaseFirestore.getInstance().collection("wakeCalls").document(callId).update("state", state, "updatedAt", FieldValue.serverTimestamp());
 }
}
