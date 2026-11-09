package com.mushafi.app;
/** Offline suggestions only; online AUTO uses the provider's location-based method. */
public final class PrayerRegion {
 public static String method(PrayerSettings settings){String chosen=settings.json.optString("method");return (settings.json.optBoolean("autoMethod")||chosen.equals("AUTO"))?method(settings.json.optString("timezone")):chosen;}
 public static String method(String zone){
  if(zone.equals("Asia/Riyadh")||zone.equals("Asia/Aden"))return "UMM_AL_QURA";
  if(zone.equals("Asia/Dubai"))return "DUBAI";if(zone.equals("Asia/Kuwait"))return "KUWAIT";if(zone.equals("Asia/Qatar"))return "QATAR";
  if(zone.equals("Africa/Cairo"))return "EGYPTIAN";
  if(zone.equals("Asia/Karachi")||zone.equals("Asia/Dhaka")||zone.equals("Asia/Kolkata")||zone.equals("Asia/Calcutta"))return "KARACHI";
  if(zone.equals("Asia/Singapore")||zone.equals("Asia/Kuala_Lumpur")||zone.equals("Asia/Kuching")||zone.startsWith("Asia/Jakarta")||zone.equals("Asia/Makassar")||zone.equals("Asia/Jayapura"))return "SINGAPORE";
  if(zone.startsWith("America/"))return "NORTH_AMERICA";
  return "MUSLIM_WORLD_LEAGUE";
 }
}
