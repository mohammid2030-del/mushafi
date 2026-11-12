package com.mushafi.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import org.json.*;
import java.util.*;

/** صحبة الفجر: stores the lists the page edits, and wakes the phone at Fajr to start calling. */
public final class FajrCompanion {
 static final String PREFS = "fajr_companion", ACTION = "com.mushafi.app.FAJR_EVENT", DISMISS = "com.mushafi.app.FAJR_DISMISS", CHANNEL = "fajr_companion_v1";
 static final int REQUEST = 8130, NOTICE = 8131, OPEN = 8132, SKIP = 8133;

 static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, 0); }

 /** Accept only the shape the page writes; anything else is refused so a bad value never schedules calls. */
 static JSONObject validate(String text) throws JSONException {
  if (text == null || text.length() > 80000) throw new JSONException("size");
  JSONObject config = new JSONObject(text);
  JSONArray lists = config.optJSONArray("lists");
  if (lists == null || lists.length() > 20) throw new JSONException("lists");
  for (int i = 0; i < lists.length(); i++) {
   JSONObject l = lists.getJSONObject(i);
   if (!l.optString("id").matches("[a-z0-9]{1,16}")) throw new JSONException("id");
   if (!"adhan".equals(l.optString("mode")) && !"manual".equals(l.optString("mode"))) throw new JSONException("mode");
   if (!l.optString("time").matches("([01][0-9]|2[0-3]):[0-5][0-9]")) throw new JSONException("time");
   int offset = l.optInt("offset", 0); if (offset < -30 || offset > 60) throw new JSONException("offset");
   JSONArray days = l.optJSONArray("days"); if (days == null || days.length() > 7) throw new JSONException("days");
   for (int d = 0; d < days.length(); d++) { int v = days.getInt(d); if (v < 0 || v > 6) throw new JSONException("day"); }
   JSONArray members = l.optJSONArray("members"); if (members == null || members.length() > 30) throw new JSONException("members");
   for (int m = 0; m < members.length(); m++) if (!members.getJSONObject(m).optString("id").matches("[A-Za-z0-9]{6,128}")) throw new JSONException("member");
  }
  return config;
 }

 public static JSONObject load(Context c) { try { return validate(prefs(c).getString("config", "")); } catch (Exception e) { return null; } }

 public static void save(Context c, String text) throws JSONException {
  JSONObject config = validate(text);
  if (!prefs(c).edit().putString("config", config.toString()).commit()) throw new JSONException("storage");
  schedule(c);
 }

 static final class Event { final long at; final String list; Event(long at, String list) { this.at = at; this.list = list; } String id() { return list + "|" + at; } }

 static List<Event> events(Context c, long now) {
  List<Event> out = new ArrayList<>();
  JSONObject config = load(c); if (config == null) return out;
  PrayerSettings settings = PrayerSettings.load(c);
  JSONArray lists = config.optJSONArray("lists");
  for (int i = 0; lists != null && i < lists.length(); i++) {
   JSONObject l = lists.optJSONObject(i);
   if (l == null || !l.optBoolean("enabled") || l.optJSONArray("members").length() == 0) continue;
   Set<Integer> days = new HashSet<>(); JSONArray d = l.optJSONArray("days");
   for (int k = 0; d != null && k < d.length(); k++) days.add(d.optInt(k));
   if (days.isEmpty()) continue;
   for (int add = 0; add < 9; add++) {
    try {
     long at;
     Calendar day = Calendar.getInstance(); day.setTimeInMillis(now); day.add(Calendar.DATE, add);
     if (!days.contains(day.get(Calendar.DAY_OF_WEEK) - 1)) continue;
     if ("manual".equals(l.optString("mode"))) {
      String[] hm = l.optString("time").split(":");
      day.set(Calendar.HOUR_OF_DAY, Integer.parseInt(hm[0])); day.set(Calendar.MINUTE, Integer.parseInt(hm[1])); day.set(Calendar.SECOND, 0); day.set(Calendar.MILLISECOND, 0);
      at = day.getTimeInMillis();
     } else {
      if (!settings.json.optBoolean("confirmed")) break;
      JSONObject times = PrayerCalculator.calculate(settings, PrayerCalculator.day(settings, now, add));
      at = times.getLong("fajr") + l.optInt("offset", 0) * PrayerCalculator.MINUTE;
     }
     if (at > now) out.add(new Event(at, l.optString("id")));
    } catch (Exception ignored) {}
   }
  }
  Collections.sort(out, (a, b) -> Long.compare(a.at, b.at));
  return out;
 }

 static AlarmManager alarms(Context c) { return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE); }
 static NotificationManager notes(Context c) { return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); }

 static PendingIntent pending(Context c, Event e) {
  Intent i = new Intent(c, FajrAlarmReceiver.class).setAction(ACTION);
  if (e != null) i.putExtra("at", e.at).putExtra("list", e.list);
  return PendingIntent.getBroadcast(c, REQUEST, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
 }

 static PendingIntent open(Context c, String list) {
  Intent i = new Intent(c, MainActivity.class).putExtra("fajrRun", list).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
  return PendingIntent.getActivity(c, OPEN, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
 }

 static void channel(Context c) {
  if (Build.VERSION.SDK_INT < 26) return;
  NotificationChannel ch = new NotificationChannel(CHANNEL, UiLocale.text(c, "صحبة الفجر"), NotificationManager.IMPORTANCE_HIGH);
  ch.setDescription(UiLocale.text(c, "منبّه بدء الاتصال بقائمتك وقت الفجر"));
  ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
  ch.enableVibration(true); ch.setVibrationPattern(new long[]{0, 600, 400, 600});
  ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
  notes(c).createNotificationChannel(ch);
 }

 public static synchronized void schedule(Context c) {
  channel(c);
  alarms(c).cancel(pending(c, null));
  prefs(c).edit().remove("next").remove("nextList").apply();
  if (!PrayerScheduler.exact(c)) return;
  long now = System.currentTimeMillis();
  Set<String> fired = prefs(c).getStringSet("fired", Collections.emptySet());
  for (Event e : events(c, now)) {
   if (fired.contains(e.id())) continue;
   alarms(c).setAlarmClock(new AlarmManager.AlarmClockInfo(e.at, open(c, e.list)), pending(c, e));
   prefs(c).edit().putLong("next", e.at).putString("nextList", e.list).apply();
   break;
  }
 }

 public static synchronized void deliver(Context c, Intent intent) {
  long now = System.currentTimeMillis(), at = intent.getLongExtra("at", 0);
  String list = intent.getStringExtra("list");
  if (list == null || at > now + 5000 || now - at > 15 * 60000L) return;
  JSONObject config = load(c); if (config == null) return;
  String name = null;
  JSONArray lists = config.optJSONArray("lists");
  for (int i = 0; lists != null && i < lists.length(); i++) { JSONObject l = lists.optJSONObject(i); if (l != null && list.equals(l.optString("id")) && l.optBoolean("enabled")) name = l.optString("name"); }
  if (name == null) return;
  Set<String> fired = new HashSet<>(prefs(c).getStringSet("fired", Collections.emptySet()));
  String id = list + "|" + at; if (fired.contains(id)) return;
  for (Iterator<String> it = fired.iterator(); it.hasNext();) { String v = it.next(); try { if (now - Long.parseLong(v.substring(v.indexOf('|') + 1)) > 3 * 86400000L) it.remove(); } catch (Exception e) { it.remove(); } }
  fired.add(id);
  prefs(c).edit().putStringSet("fired", fired).putString("launch", list).putLong("launchAt", now).commit();
  if (!PrayerScheduler.notifications(c)) return;
  channel(c);
  PendingIntent show = open(c, list);
  Intent skip = new Intent(c, FajrAlarmReceiver.class).setAction(DISMISS);
  PendingIntent skipPi = PendingIntent.getBroadcast(c, SKIP, skip, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  String title = UiLocale.text(c, "حان وقت صحبة الفجر");
  String body = UiLocale.text(c, "اضغط لبدء الاتصال بـ «{0}»", name.isEmpty() ? UiLocale.text(c, "قائمة الفجر") : name);
  Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
  AppIdentity.decorate(c, b).setContentTitle(title).setContentText(body).setContentIntent(show).setFullScreenIntent(show, true)
   .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC).setAutoCancel(true).setOngoing(true)
   .setColor(AppIdentity.notificationColor(c)).addAction(new Notification.Action.Builder(null, UiLocale.text(c, "ابدأ الآن"), show).build())
   .addAction(new Notification.Action.Builder(null, UiLocale.text(c, "تخطَّ اليوم"), skipPi).build());
  if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(20 * 60000L);
  else b.setPriority(Notification.PRIORITY_MAX).setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM));
  notes(c).notify(NOTICE, b.build());
 }

 public static void dismiss(Context c) { notes(c).cancel(NOTICE); prefs(c).edit().remove("launch").remove("launchAt").apply(); }

 /** The list to start now, if the Fajr alarm fired in the last 20 minutes; read once. */
 public static String consumeLaunch(Context c) {
  SharedPreferences p = prefs(c); String list = p.getString("launch", "");
  long at = p.getLong("launchAt", 0);
  p.edit().remove("launch").remove("launchAt").apply();
  return list.isEmpty() || System.currentTimeMillis() - at > 20 * 60000L ? "" : list;
 }

 public static void markLaunch(Context c, String list) {
  if (list != null && list.matches("[a-z0-9]{1,16}")) prefs(c).edit().putString("launch", list).putLong("launchAt", System.currentTimeMillis()).commit();
 }

 public static JSONObject status(Context c) throws JSONException {
  JSONObject j = new JSONObject().put("platform", "android")
   .put("notifications", PrayerScheduler.notifications(c)).put("exact", PrayerScheduler.exact(c))
   .put("next", prefs(c).getLong("next", 0)).put("nextList", prefs(c).getString("nextList", ""));
  if (Build.VERSION.SDK_INT >= 34) j.put("fullScreen", notes(c).canUseFullScreenIntent());
  return j;
 }

 /** Keep the number to digits and one leading plus, as the page validated it. */
 public static String number(String raw) {
  if (raw == null) return null;
  String s = raw.replaceAll("[^0-9+]", "");
  return s.matches("\\+?[0-9]{3,18}") ? s : null;
 }
}
