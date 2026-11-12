package com.mushafi.app;

import android.content.Context;
import org.json.*;

/** Adhan voice muted for single prayers of today only; the notification itself still arrives. */
final class PrayerMute {
 private static final String PREFS = "prayer_mute";

 static String save(Context c, String text) {
  try {
   JSONArray in = new JSONArray(text == null ? "[]" : text), out = new JSONArray();
   long now = System.currentTimeMillis();
   for (int i = 0; i < in.length() && out.length() < 12; i++) {
    JSONObject e = in.optJSONObject(i); if (e == null) continue;
    String key = e.optString("key"); long at = e.optLong("at");
    boolean known = false; for (String k : PrayerSettings.KEYS) if (k.equals(key)) known = true;
    if (known && at > now - 2 * 3600000L && at < now + 26 * 3600000L) out.put(new JSONObject().put("key", key).put("at", at));
   }
   c.getSharedPreferences(PREFS, 0).edit().putString("list", out.toString()).commit();
   return out.toString();
  } catch (Exception e) { return "[]"; }
 }

 static boolean muted(Context c, String key, long at) {
  try {
   JSONArray list = new JSONArray(c.getSharedPreferences(PREFS, 0).getString("list", "[]"));
   for (int i = 0; i < list.length(); i++) {
    JSONObject e = list.getJSONObject(i);
    if (e.optString("key").equals(key) && Math.abs(e.optLong("at") - at) < 90000L) return true;
   }
  } catch (Exception ignored) {}
  return false;
 }
}
