package com.mushafi.app;
import com.batoulapps.adhan.*;
import com.batoulapps.adhan.data.DateComponents;
import org.json.*;
import java.util.*;

public final class PrayerCalculator {
 public static final long MINUTE=60000L;
 public static Calendar day(PrayerSettings s,long now,int add){Calendar c=new GregorianCalendar(TimeZone.getTimeZone(s.json.optString("timezone")),Locale.US);c.setTimeInMillis(now);c.add(Calendar.DATE,add);return c;}
 public static boolean ramadan(Calendar c){
  if(android.os.Build.VERSION.SDK_INT>=24){android.icu.util.IslamicCalendar h=new android.icu.util.IslamicCalendar(android.icu.util.TimeZone.getTimeZone(c.getTimeZone().getID()));h.setCalculationType(android.icu.util.IslamicCalendar.CalculationType.ISLAMIC_UMALQURA);h.setTimeInMillis(c.getTimeInMillis());return h.get(android.icu.util.Calendar.MONTH)==8;}
  // Civil-calendar fallback on Android 6; the setting can always be overridden.
  double jd=Math.floor(c.getTimeInMillis()/86400000.0)+2440587.5;int year=(int)Math.floor((30*(jd-1948439.5)+10646)/10631);double first=354*(year-1)+Math.floor((3+11*year)/30.0)+1948439.5;int month=Math.min(12,(int)Math.ceil((jd-29-first)/29.5)+1);return month==9;
 }
 public static JSONObject calculate(PrayerSettings s,Calendar c)throws JSONException{
  JSONObject remote=PrayerRemoteSource.day(s,c);if(remote!=null)return remote;
  CalculationParameters p=CalculationMethod.valueOf(PrayerRegion.method(s)).getParameters();p.madhab=Madhab.valueOf(s.json.optString("asr"));
  JSONObject o=s.json.optJSONObject("offsets");p.adjustments.fajr=o.optInt("fajr");p.adjustments.sunrise=o.optInt("sunrise");p.adjustments.dhuhr=o.optInt("dhuhr");p.adjustments.asr=o.optInt("asr");p.adjustments.maghrib=o.optInt("maghrib");p.adjustments.isha=o.optInt("isha");
  String mode=s.json.optString("ramadan");boolean extra=mode.equals("on")||(mode.equals("auto")&&ramadan(c));if(PrayerRegion.method(s).equals("UMM_AL_QURA")&&extra)p.adjustments.isha+=30;
  PrayerTimes times=new PrayerTimes(new Coordinates(s.json.optDouble("latitude"),s.json.optDouble("longitude")),new DateComponents(c.get(Calendar.YEAR),c.get(Calendar.MONTH)+1,c.get(Calendar.DAY_OF_MONTH)),p);
  JSONObject result=new JSONObject();result.put("date",String.format(Locale.US,"%04d-%02d-%02d",c.get(Calendar.YEAR),c.get(Calendar.MONTH)+1,c.get(Calendar.DAY_OF_MONTH)));result.put("ramadanAdjustment",extra&&PrayerRegion.method(s).equals("UMM_AL_QURA"));
  Date[] dates={times.fajr,times.sunrise,times.dhuhr,times.asr,times.maghrib,times.isha};String[] keys={"fajr","sunrise","dhuhr","asr","maghrib","isha"};long previous=0;
  for(int i=0;i<keys.length;i++){if(dates[i]==null||dates[i].getTime()<=previous)throw new JSONException("No valid ordered solar times for these coordinates/date");previous=dates[i].getTime();result.put(keys[i],previous);}
  PrayerRemoteSource.apply(s,c,result);result.put("duha",result.getLong("sunrise")+s.json.optInt("duhaOffset")*MINUTE);result.put("duhaEnd",result.getLong("dhuhr")-s.json.optInt("zawalOffset")*MINUTE);return result;
 }
 public static JSONObject snapshot(PrayerSettings s,long now)throws JSONException{JSONArray days=new JSONArray();for(int n=-1;n<=2;n++)days.put(calculate(s,day(s,now,n)));JSONObject result=new JSONObject();result.put("now",now);result.put("settings",s.json);result.put("days",days);return result;}
}
