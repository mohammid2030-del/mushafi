package com.mushafi.app;

import android.app.*;
import android.content.*;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import java.util.Map;

/** Incoming صحبة الفجر ring: a call-style full-screen notification that stops on answer, decline, cancel or timeout. */
final class WakeRing {
 static final String CHANNEL = "wake_ring_v1", MISSED = "wake_missed_v1";
 static final String ANSWER = "com.mushafi.app.WAKE_ANSWER", DECLINE = "com.mushafi.app.WAKE_DECLINE", TIMEOUT = "com.mushafi.app.WAKE_TIMEOUT";
 static final int NOTICE = 8140;

 static NotificationManager nm(Context c) { return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); }

 static void channels(Context c) {
  if (Build.VERSION.SDK_INT < 26) return;
  NotificationChannel ring = new NotificationChannel(CHANNEL, UiLocale.text(c, "رنين صحبة الفجر"), NotificationManager.IMPORTANCE_HIGH);
  ring.setDescription(UiLocale.text(c, "عندما يصحّيك أحد للفجر"));
  ring.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
  ring.enableVibration(true); ring.setVibrationPattern(new long[]{0, 900, 600, 900, 600});
  ring.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
  NotificationChannel missed = new NotificationChannel(MISSED, UiLocale.text(c, "مكالمات صحبة فائتة"), NotificationManager.IMPORTANCE_DEFAULT);
  nm(c).createNotificationChannel(ring); nm(c).createNotificationChannel(missed);
 }

 static void receive(Context c, Map<String, String> data) {
  String type = data.get("type"), callId = data.get("callId"), name = data.get("fromName");
  if (callId == null || !callId.matches("[A-Za-z0-9]{10,40}")) return;
  if (name == null) name = ""; if (name.length() > 60) name = name.substring(0, 60);
  if ("wake".equals(type)) ring(c, callId, name);
  else if ("wakeEnd".equals(type)) end(c, callId, data.get("state"), name);
 }

 private static PendingIntent action(Context c, String action, String callId, int req) {
  Intent i = new Intent(c, WakeActionReceiver.class).setAction(action).putExtra("callId", callId);
  return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
 }

 static void ring(Context c, String callId, String name) {
  if (!PrayerScheduler.notifications(c)) return;
  SharedPreferences p = c.getSharedPreferences("wake", 0);
  if (callId.equals(p.getString("ended", ""))) return;
  p.edit().putString("ringing", callId).putString("ringingName", name).putLong("ringingAt", System.currentTimeMillis()).apply();
  channels(c);
  Intent screen = new Intent(c, WakeCallActivity.class).putExtra("callId", callId).putExtra("name", name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
  PendingIntent full = PendingIntent.getActivity(c, 8141, screen, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  PendingIntent answer = action(c, ANSWER, callId, 8142), decline = action(c, DECLINE, callId, 8143);
  String title = name.isEmpty() ? UiLocale.text(c, "صحبة الفجر") : name, body = UiLocale.text(c, "يصحّيك للفجر");
  Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
  AppIdentity.decorate(c, b).setContentTitle(title).setContentText(body).setCategory(Notification.CATEGORY_CALL)
   .setVisibility(Notification.VISIBILITY_PUBLIC).setOngoing(true).setAutoCancel(false).setFullScreenIntent(full, true).setContentIntent(full)
   .setColor(AppIdentity.notificationColor(c));
  if (Build.VERSION.SDK_INT >= 31) {
   Person caller = new Person.Builder().setName(title).setImportant(true).build();
   b.setStyle(Notification.CallStyle.forIncomingCall(caller, decline, answer));
  } else {
   b.addAction(new Notification.Action.Builder(null, UiLocale.text(c, "رفض"), decline).build());
   b.addAction(new Notification.Action.Builder(null, UiLocale.text(c, "ردّ"), answer).build());
  }
  if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(WakeClient.RING_SECONDS * 1000L + 5000L);
  else b.setPriority(Notification.PRIORITY_MAX).setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE));
  Notification n = b.build();
  n.flags |= Notification.FLAG_INSISTENT;
  nm(c).notify(NOTICE, n);
  // Stop by ourselves if nobody touches it.
  AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
  am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, android.os.SystemClock.elapsedRealtime() + WakeClient.RING_SECONDS * 1000L + 3000L, action(c, TIMEOUT, callId, 8144));
 }

 static void stopRinging(Context c, String callId) {
  SharedPreferences p = c.getSharedPreferences("wake", 0);
  if (callId != null && !callId.equals(p.getString("ringing", ""))) return;
  nm(c).cancel(NOTICE);
  p.edit().remove("ringing").putString("ended", callId == null ? "" : callId).apply();
  c.sendBroadcast(new Intent(WakeCallActivity.CLOSE).setPackage(c.getPackageName()));
 }

 static void end(Context c, String callId, String state, String name) {
  boolean wasRinging = callId.equals(c.getSharedPreferences("wake", 0).getString("ringing", ""));
  stopRinging(c, callId);
  if (("missed".equals(state) || "cancelled".equals(state)) && (wasRinging || "missed".equals(state))) missed(c, callId, name);
 }

 static void missed(Context c, String callId, String name) {
  if (!PrayerScheduler.notifications(c)) return;
  channels(c);
  Intent open = new Intent(c, MainActivity.class).putExtra("fajrOpen", true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent pi = PendingIntent.getActivity(c, 8145, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, MISSED) : new Notification.Builder(c);
  AppIdentity.decorate(c, b).setContentTitle(UiLocale.text(c, "مكالمة صحبة فائتة")).setContentText(name.isEmpty() ? UiLocale.text(c, "صحبة الفجر") : name)
   .setCategory(Notification.CATEGORY_MISSED_CALL).setAutoCancel(true).setContentIntent(pi).setColor(AppIdentity.notificationColor(c)).setWhen(System.currentTimeMillis()).setShowWhen(true);
  nm(c).notify(NOTICE + 1 + Math.abs(callId.hashCode() % 50), b.build());
 }
}
